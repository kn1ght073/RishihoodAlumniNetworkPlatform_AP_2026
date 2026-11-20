const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { notify } = require('../services/notificationService');
const { uuid, text, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireVerifiedMember);

router.post('/', requireAuth, async (req, res) => {
  const alumnusId = req.body.alumnusId;
  const goals = text(req.body.goals, 3000);
  const topics = text(req.body.topics, 500);
  if (!uuid(alumnusId) || alumnusId === req.session.userId || goals.length < 10) throw httpError(400, 'Choose an alumnus and describe your mentoring goals.');
  const eligibility = await pool.query(
    `SELECT m.membership_status, m.verification_status, cp.open_to_mentoring
     FROM university_memberships m JOIN career_preferences cp ON cp.user_id = m.user_id
     JOIN users u ON u.id = m.user_id WHERE m.user_id = $1 AND u.account_status = 'ACTIVE'`, [alumnusId]
  );
  const alumnus = eligibility.rows[0];
  if (!alumnus || alumnus.membership_status !== 'ALUMNI' || alumnus.verification_status !== 'VERIFIED') throw httpError(404, 'Verified alumnus not found.');
  if (!alumnus.open_to_mentoring) throw httpError(403, 'This alumnus is not accepting mentorship requests.');
  const student = await pool.query(`SELECT membership_status FROM university_memberships WHERE user_id = $1`, [req.session.userId]);
  if (student.rows[0]?.membership_status !== 'STUDENT') throw httpError(403, 'Mentorship requests are available to current students.');
  try {
    const inserted = await pool.query(
      `INSERT INTO mentorship_requests(student_id, alumnus_id, goals, topics) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.session.userId, alumnusId, goals, topics]
    );
    await notify(alumnusId, 'MENTORSHIP_REQUEST', 'New mentorship request', 'A student would like to learn from you.', inserted.rows[0].id);
    res.status(201).json({ id: inserted.rows[0].id, message: 'Mentorship request sent.' });
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'A pending mentorship request already exists.');
    throw error;
  }
});

router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT mr.id, mr.student_id, mr.alumnus_id, mr.goals, mr.topics, mr.status, mr.created_at, mr.updated_at,
            student.full_name AS student_name, alumnus.full_name AS alumnus_name
     FROM mentorship_requests mr JOIN users student ON student.id = mr.student_id
     JOIN users alumnus ON alumnus.id = mr.alumnus_id
     WHERE mr.student_id = $1 OR mr.alumnus_id = $1 ORDER BY mr.updated_at DESC`, [req.session.userId]
  );
  res.json({ requests: result.rows });
});

router.put('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid mentorship request.');
  const status = req.body.status;
  if (!['ACCEPTED', 'DECLINED', 'ENDED'].includes(status)) throw httpError(400, 'Choose accept, decline, or end.');
  const request = await pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM mentorship_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
      const row = result.rows[0];
      if (!row) throw httpError(404, 'Mentorship request not found.');
      const mentorResponse = row.alumnus_id === req.session.userId && ['ACCEPTED', 'DECLINED'].includes(status) && row.status === 'PENDING';
      const studentEnds = row.student_id === req.session.userId && status === 'ENDED' && row.status === 'ACCEPTED';
      if (!mentorResponse && !studentEnds) throw httpError(403, 'You cannot make that change to this mentorship.');
      await client.query('UPDATE mentorship_requests SET status = $2, updated_at = now() WHERE id = $1', [row.id, status]);
      await client.query('COMMIT');
      return row;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
  const other = request.student_id === req.session.userId ? request.alumnus_id : request.student_id;
  await notify(other, 'MENTORSHIP_STATUS', 'Mentorship request updated', `Mentorship status changed to ${status.toLowerCase()}.`, request.id);
  res.json({ message: `Mentorship ${status.toLowerCase()}.` });
});

module.exports = router;
