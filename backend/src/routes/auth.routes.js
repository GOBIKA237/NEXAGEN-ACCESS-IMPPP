import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { scoreLogin } from '../utils/rulesEngine.js';

// Owned by Backend Dev 1. Fill in error handling / validation as you build.
const router = Router();

// Deliberately simple/permissive — good enough to catch obviously malformed
// input without rejecting valid-but-unusual addresses. Not a full RFC 5322
// implementation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// --- Account lockout -------------------------------------------------------
//
// This is a hard block, separate from rulesEngine.js's scoreLogin(). scoreLogin
// already counts failed attempts (>=5 in a 2-minute window -> +50 risk), but
// that only ever raises a risk_score for the alerts feed — it never stops a
// login. Reusing its exact window/threshold here would tie a security control
// to constants tuned for a scoring heuristic, so this tracks the same kind of
// signal (recent failures on login_events) independently, with its own window
// long enough to actually slow down a brute-force attempt.
//
// Because the query is windowed, the lock lifts on its own once the window
// rolls past the last failure — no separate "locked_until" column needed, and
// schema.sql (locked) stays untouched.
const LOCKOUT_THRESHOLD = parseInt(process.env.LOGIN_LOCKOUT_THRESHOLD, 10) || 5;
const LOCKOUT_WINDOW_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_WINDOW_MINUTES, 10) || 15;

// Returns { locked: false } or { locked: true, retryAfterSeconds }.
async function getLockoutStatus(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS fail_count, MAX(created_at) AS last_failed_at
     FROM login_events
     WHERE user_id = $1 AND success = false
       AND created_at > NOW() - make_interval(mins => $2)`,
    [userId, LOCKOUT_WINDOW_MINUTES]
  );
  const { fail_count: failCount, last_failed_at: lastFailedAt } = rows[0];

  if (failCount < LOCKOUT_THRESHOLD) return { locked: false };

  const unlockAt = new Date(lastFailedAt).getTime() + LOCKOUT_WINDOW_MINUTES * 60 * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000));
  return { locked: true, retryAfterSeconds };
}

async function fetchRolesAndPermissions(userId) {
  const { rows: roleRows } = await pool.query(
    `SELECT r.name
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId]
  );

  const { rows: permRows } = await pool.query(
    `SELECT DISTINCT p.name
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  return {
    roles: roleRows.map((r) => r.name),
    permissions: permRows.map((p) => p.name),
  };
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, password are required' });
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );
    const newUser = rows[0];

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'employee'`,
      [newUser.id]
    );

    res.status(201).json(newUser);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip;
  const deviceFingerprint = req.headers['user-agent'];

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'This account has been deactivated' });
    }

    const lockout = await getLockoutStatus(user.id);
    if (lockout.locked) {
      // Log the attempt (so hammering the endpoint while locked keeps
      // extending the window) but skip bcrypt entirely — no need to spend
      // the compute or reveal whether the password would've matched.
      await pool.query(
        `INSERT INTO login_events (user_id, success, ip_address, device_fingerprint, risk_score)
         VALUES ($1, false, $2, $3, 0)`,
        [user.id, ipAddress, deviceFingerprint]
      );
      res.set('Retry-After', String(lockout.retryAfterSeconds));
      return res.status(429).json({
        error: `Too many failed login attempts. Try again in ${lockout.retryAfterSeconds}s.`,
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    // Insert the attempt into login_events regardless of outcome, now that
    // we have a user.id to attach it to. risk_score starts at 0 and is
    // updated below only on a successful password match.
    const { rows: eventRows } = await pool.query(
      `INSERT INTO login_events (user_id, success, ip_address, device_fingerprint, risk_score)
       VALUES ($1, $2, $3, $4, 0)
       RETURNING id`,
      [user.id, match, ipAddress, deviceFingerprint]
    );
    const loginEventId = eventRows[0].id;

    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Score this login and update the row just inserted.
    const riskScore = await scoreLogin({ userId: user.id, deviceFingerprint });
    await pool.query(
      `UPDATE login_events SET risk_score = $1 WHERE id = $2`,
      [riskScore, loginEventId]
    );

    const { roles, permissions } = await fetchRolesAndPermissions(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, roles, permissions } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    // The JWT only carries { id, email } — roles/permissions are always
    // re-queried here, never read from the token, so a role change made
    // after the token was issued shows up on the very next /me call instead
    // of waiting for the user to log in again.
    const { roles, permissions } = await fetchRolesAndPermissions(req.user.id);

    res.json({ ...rows[0], roles, permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load current user' });
  }
});

export default router;