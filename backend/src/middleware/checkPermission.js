import { pool } from '../config/db.js';

// Owned by Backend Dev 2.
// Usage: router.get('/admin/users', requireAuth, checkPermission('manage_users'), handler)
export function checkPermission(featureName) {
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const { rows } = await pool.query(
        `SELECT 1
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1 AND p.name = $2
         LIMIT 1`,
        [userId, featureName]
      );

      const allowed = rows.length > 0;

      // Every check gets logged, allowed or not — this feeds the audit log
      // and, on repeated denials, the anomaly rules engine.
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, resource, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [userId, allowed ? 'ACCESS_GRANTED' : 'ACCESS_DENIED', featureName, req.ip]
      );

      if (!allowed) return res.status(403).json({ error: 'Permission denied' });
      next();
    } catch (err) {
      console.error('checkPermission error', err);
      res.status(500).json({ error: 'Internal error checking permissions' });
    }
  };
}
