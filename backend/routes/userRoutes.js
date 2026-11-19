const express = require('express');
const path = require('path');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { uuid, httpError } = require('../utils/validation');

const router = express.Router();

router.get('/:id/picture', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid user profile.');
  const result = await pool.query(
    `SELECT p.avatar_path, p.profile_visibility,
            EXISTS(SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)) AS connected
     FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $2 AND u.account_status = 'ACTIVE'`,
    [req.session.userId, req.params.id]
  );
  const profile = result.rows[0];
  if (!profile || (!profile.avatar_path) || (req.params.id !== req.session.userId && (profile.profile_visibility === 'PRIVATE' || (profile.profile_visibility === 'CONNECTIONS' && !profile.connected)))) {
    return res.status(404).json({ error: 'Profile picture not found.' });
  }
  res.sendFile(path.basename(profile.avatar_path), { root: path.join(__dirname, '..', '..', 'uploads') });
});

router.get('/:id', requireAuth, requireVerifiedMember, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid user profile.');
  const result = await pool.query(
    `SELECT u.id, u.full_name, p.avatar_path, p.bio, p.current_location, p.profile_visibility, p.employment_visibility,
            m.course, m.membership_status, m.graduation_year,
            EXISTS(SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)) AS connected
     FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN university_memberships m ON m.user_id = u.id
     WHERE u.id = $2 AND u.account_status = 'ACTIVE'`, [req.session.userId, req.params.id]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'Profile not found.' });
  const isSelf = user.id === req.session.userId;
  if (!isSelf && (user.profile_visibility === 'PRIVATE' || (user.profile_visibility === 'CONNECTIONS' && !user.connected))) return res.status(404).json({ error: 'Profile not found.' });
  delete user.profile_visibility;
  delete user.connected;
  if (!isSelf && user.employment_visibility === 'PRIVATE') delete user.employment_visibility;
  res.json({ user });
});

module.exports = router;
