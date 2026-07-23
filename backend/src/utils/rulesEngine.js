import { pool } from '../config/db.js';

export async function scoreLogin({ userId, deviceFingerprint }) {
  let score = 0;

  const { rows: recentFails } = await pool.query(
    `SELECT COUNT(*) FROM login_events
     WHERE user_id = $1 AND success = false AND created_at > NOW() - INTERVAL '2 minutes'`,
    [userId]
  );
  if (parseInt(recentFails[0].count, 10) >= 5) score += 50;

  const { rows: knownDevice } = await pool.query(
    `SELECT 1 FROM login_events WHERE user_id = $1 AND device_fingerprint = $2 LIMIT 1`,
    [userId, deviceFingerprint]
  );
  if (knownDevice.length === 0) score += 30;

  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) score += 20;

  return Math.min(score, 100);
}

// --- Alerts support -------------------------------------------------------
//
// scoreLogin() intentionally keeps returning a plain number: auth.routes.js
// (Backend Dev 1's file) does `const riskScore = await scoreLogin(...)` and
// writes it straight into the integer `risk_score` column, so changing the
// return shape there would silently corrupt that column. Instead, for the
// admin alerts feed we recompute *which* rule(s) fired for an already-stored
// login_events row, using that row's own data.
//
// NOTE: this deliberately does NOT reproduce a quirk in scoreLogin() above —
// auth.routes.js inserts the login_events row *before* calling scoreLogin(),
// so the "known device" query there always finds the row it just inserted
// and the +30 unrecognized-device signal can never actually fire today.
// Flagging this for whoever picks up rulesEngine.js next rather than
// changing scoreLogin()'s live scoring behavior in this change.
//
// Because of that, don't try to back out "which rules fired" from
// risk_score alone — 30 + 20 and a lone 50 both sum to 50, so the total
// is ambiguous. We recheck each signal directly instead.

const FAILED_ATTEMPTS_THRESHOLD = 5;
const FAILED_ATTEMPTS_WINDOW = '2 minutes';
const OFF_HOURS_START = 0; // midnight
const OFF_HOURS_END = 5; // 5am, exclusive

/**
 * Re-derive which risk signal(s) fired for a stored login_events row.
 * @param {{ id: number, userId: number, deviceFingerprint: string, createdAt: string|Date }} loginEvent
 * @returns {Promise<string[]>} human-readable reasons, e.g. ["5+ failed logins in 2 minutes"]
 */
export async function explainRiskSignals({ id, userId, deviceFingerprint, createdAt }) {
  const reasons = [];

  const { rows: recentFails } = await pool.query(
    `SELECT COUNT(*) FROM login_events
     WHERE user_id = $1 AND success = false
       AND created_at > $2::timestamp - INTERVAL '${FAILED_ATTEMPTS_WINDOW}'
       AND created_at <= $2::timestamp`,
    [userId, createdAt]
  );
  if (parseInt(recentFails[0].count, 10) >= FAILED_ATTEMPTS_THRESHOLD) {
    reasons.push('5+ failed logins in 2 minutes');
  }

  // Unlike scoreLogin()'s live check, exclude the event itself so a login's
  // very first appearance from a device actually counts as "unrecognized".
  const { rows: priorDevice } = await pool.query(
    `SELECT 1 FROM login_events
     WHERE user_id = $1 AND device_fingerprint = $2 AND id != $3
     LIMIT 1`,
    [userId, deviceFingerprint, id]
  );
  if (priorDevice.length === 0) {
    reasons.push('login from unrecognized device');
  }

  const hour = new Date(createdAt).getHours();
  if (hour >= OFF_HOURS_START && hour < OFF_HOURS_END) {
    reasons.push('login during off-hours (midnight–5am)');
  }

  return reasons;
}