const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { withTransaction } = require('../services/transactionService');
const { notify } = require('../services/notificationService');
const { uuid, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireVerifiedMember);

router.post('/request', requireAuth, async (req, res) => {
  const recipientId = req.body.recipientId;
  if (!uuid(recipientId) || recipientId === req.session.userId) throw httpError(400, 'Choose another member to connect with.');
  const recipient = await pool.query(
    `SELECT u.id FROM users u JOIN university_memberships m ON m.user_id = u.id
     WHERE u.id = $1 AND u.account_status = 'ACTIVE' AND m.verification_status = 'VERIFIED'`, [recipientId]
  );
  if (!recipient.rowCount) throw httpError(404, 'Member not found.');
  const existing = await pool.query(
    `SELECT 1 FROM connections WHERE member_low_id = LEAST($1::uuid, $2::uuid) AND member_high_id = GREATEST($1::uuid, $2::uuid)`,
    [req.session.userId, recipientId]
  );
  if (existing.rowCount) throw httpError(409, 'You are already connected.');
  try {
    const result = await pool.query(
      `INSERT INTO connection_requests(sender_id, recipient_id) VALUES ($1, $2) RETURNING id`,
      [req.session.userId, recipientId]
    );
    await notify(recipientId, 'CONNECTION_REQUEST', 'New connection request', 'A Rishihood member would like to connect.', result.rows[0].id);
    res.status(201).json({ id: result.rows[0].id, message: 'Connection request sent.' });
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'A pending request already exists between you.');
    throw error;
  }
});

router.get('/requests', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT cr.id, cr.sender_id, cr.recipient_id, cr.status, cr.created_at,
            sender.full_name AS sender_name, recipient.full_name AS recipient_name
     FROM connection_requests cr JOIN users sender ON sender.id = cr.sender_id
     JOIN users recipient ON recipient.id = cr.recipient_id
     WHERE cr.sender_id = $1 OR cr.recipient_id = $1
     ORDER BY cr.created_at DESC LIMIT 100`, [req.session.userId]
  );
  res.json({ requests: result.rows });
});

router.put('/requests/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid connection request.');
  const action = req.body.action;
  if (!['ACCEPTED', 'DECLINED', 'CANCELLED'].includes(action)) throw httpError(400, 'Choose accept, decline, or cancel.');
  const result = await withTransaction(async (client) => {
    const locked = await client.query('SELECT * FROM connection_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
    const request = locked.rows[0];
    if (!request || request.status !== 'PENDING') throw httpError(404, 'Pending request not found.');
    const recipientAction = ['ACCEPTED', 'DECLINED'].includes(action) && request.recipient_id === req.session.userId;
    const senderCancel = action === 'CANCELLED' && request.sender_id === req.session.userId;
    if (!recipientAction && !senderCancel) throw httpError(403, 'Only the recipient can respond or the sender can cancel.');
    await client.query('UPDATE connection_requests SET status = $2, updated_at = now() WHERE id = $1', [request.id, action]);
    if (action === 'ACCEPTED') {
      await client.query(
        `INSERT INTO connections(member_low_id, member_high_id)
         SELECT LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id) FROM connection_requests WHERE id = $1
         ON CONFLICT DO NOTHING`, [request.id]
      );
    }
    return request;
  });
  if (req.body.action !== 'CANCELLED') {
    const otherUser = result.sender_id === req.session.userId ? result.recipient_id : result.sender_id;
    await notify(otherUser, 'CONNECTION_RESPONSE', `Connection ${req.body.action.toLowerCase()}`, 'Your connection request was updated.', result.id);
  }
  res.json({ message: `Connection request ${req.body.action.toLowerCase()}.` });
});

router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.full_name, p.avatar_path, m.course, m.graduation_year,
            CASE WHEN p.employment_visibility <> 'PRIVATE' THEN e.job_title END AS job_title,
            CASE WHEN p.employment_visibility <> 'PRIVATE' THEN c.name END AS company_name
     FROM connections cn JOIN users u ON u.id = CASE WHEN cn.member_low_id = $1 THEN cn.member_high_id ELSE cn.member_low_id END
     JOIN profiles p ON p.user_id = u.id LEFT JOIN university_memberships m ON m.user_id = u.id
     LEFT JOIN employment_history e ON e.user_id = u.id AND e.is_current
     LEFT JOIN companies c ON c.id = e.company_id
     WHERE (cn.member_low_id = $1 OR cn.member_high_id = $1) AND u.account_status = 'ACTIVE'
     ORDER BY u.full_name`, [req.session.userId]
  );
  res.json({ connections: result.rows });
});

module.exports = router;
