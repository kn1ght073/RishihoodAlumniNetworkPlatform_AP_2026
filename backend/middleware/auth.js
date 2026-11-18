async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  try {
    const active = await req.db.query(`SELECT 1 FROM users WHERE id = $1 AND account_status = 'ACTIVE'`, [req.session.userId]);
    if (!active.rowCount) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'This account is not active. Contact a university administrator.' });
    }
    next();
  } catch (error) { next(error); }
}

function requireRole(role) {
  return async (req, res, next) => {
    try {
      const result = await req.db.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 AND r.name = $2`,
        [req.session.userId, role]
      );
      if (!result.rowCount) return res.status(403).json({ error: 'You do not have access to this page.' });
      next();
    } catch (error) { next(error); }
  };
}

async function requireVerifiedMember(req, res, next) {
  try {
    const result = await req.db.query(
      `SELECT m.verification_status,
              EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.name = 'ADMIN') AS is_admin
       FROM users u LEFT JOIN university_memberships m ON m.user_id = u.id WHERE u.id = $1`,
      [req.session.userId]
    );
    if (!result.rowCount || (!result.rows[0].is_admin && result.rows[0].verification_status !== 'VERIFIED')) {
      return res.status(403).json({ error: 'Verify your Rishihood affiliation before using the member directory.', verificationRequired: true });
    }
    next();
  } catch (error) { next(error); }
}

module.exports = { requireAuth, requireRole, requireVerifiedMember };
