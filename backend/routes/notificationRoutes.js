const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { uuid, httpError } = require('../utils/validation');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, notification_type, title, body, reference_id, read_at, created_at
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.session.userId]
  );
  res.json({ notifications: result.rows, unreadCount: result.rows.filter((item) => !item.read_at).length });
});

router.put('/read-all', requireAuth, async (req, res) => {
  await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.session.userId]);
  res.json({ message: 'All notifications marked as read.' });
});

router.put('/:id/read', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid notification.');
  const result = await pool.query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.session.userId]);
  if (!result.rowCount) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ message: 'Notification marked as read.' });
});

module.exports = router;
