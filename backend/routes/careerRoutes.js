const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { withTransaction } = require('../services/transactionService');
const { notify } = require('../services/notificationService');
const { text, uuid, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireVerifiedMember);
const resumeUpload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads', 'resumes'),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 12 * 1024, parts: 14 },
  fileFilter(_req, file, done) {
    if (file.mimetype !== 'application/pdf') return done(httpError(400, 'Resume attachments must be PDF files under 5 MB.'));
    done(null, true);
  }
});
const kinds = {
  CAREER_GUIDANCE: 'open_to_career_guidance',
  RESUME_REVIEW: 'open_to_career_guidance',
  INTERVIEW_PREP: 'open_to_career_guidance',
  REFERRAL: 'open_to_referrals',
  GENERAL_ADVICE: 'open_to_career_guidance'
};

async function canReadRequest(userId, requestId) {
  const result = await pool.query(
    `SELECT cr.requester_id, cr.recipient_id,
            EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.name = 'ADMIN') AS is_admin
     FROM career_requests cr WHERE cr.id = $2`, [userId, requestId]
  );
  const row = result.rows[0];
  return row && (row.requester_id === userId || row.recipient_id === userId || row.is_admin);
}

router.post('/', (req, res, next) => {
  resumeUpload.single('resume')(req, res, (uploadError) => {
    if (uploadError) return next(uploadError);
    createCareerRequest(req, res).catch(async (error) => {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      next(error);
    });
  });
});

async function createCareerRequest(req, res) {
  const recipientId = req.body.recipientId;
  const type = req.body.requestType;
  const subject = text(req.body.subject, 160);
  const message = text(req.body.message, 5000);
  const jobUrl = text(req.body.jobUrl, 1000);
  if (req.body.companyId && !uuid(req.body.companyId)) throw httpError(400, 'Invalid company.');
  const companyId = req.body.companyId || null;
  if (!uuid(recipientId) || recipientId === req.session.userId) throw httpError(400, 'Choose one alumnus to receive this request.');
  if (!kinds[type]) throw httpError(400, 'Choose a valid request type.');
  if (subject.length < 2 || message.length < 10) throw httpError(400, 'Add a subject and a little more detail to your message.');
  if (jobUrl && !/^https:\/\//i.test(jobUrl)) throw httpError(400, 'Job link must use HTTPS.');
  if (req.file) {
    const signature = await fs.readFile(req.file.path);
    if (signature.toString('ascii', 0, 5) !== '%PDF-') {
      await fs.unlink(req.file.path);
      throw httpError(400, 'The resume file is not a valid PDF.');
    }
    const pdfPath = `${req.file.path}.pdf`;
    await fs.rename(req.file.path, pdfPath);
    req.file.path = pdfPath;
  }
  const eligible = await pool.query(
    `SELECT m.membership_status, m.verification_status, cp.${kinds[type]} AS open_to_request
     FROM university_memberships m JOIN career_preferences cp ON cp.user_id = m.user_id
     JOIN users u ON u.id = m.user_id WHERE m.user_id = $1 AND u.account_status = 'ACTIVE'`, [recipientId]
  );
  if (!eligible.rowCount || eligible.rows[0].membership_status !== 'ALUMNI' || eligible.rows[0].verification_status !== 'VERIFIED') throw httpError(404, 'Verified alumnus not found.');
  if (!eligible.rows[0].open_to_request) throw httpError(403, 'This alumnus is not currently accepting this type of request.');
  const requester = await pool.query(`SELECT membership_status FROM university_memberships WHERE user_id = $1`, [req.session.userId]);
  if (requester.rows[0]?.membership_status !== 'STUDENT') throw httpError(403, 'Career assistance requests are available to current students.');

  try {
    const created = await withTransaction(async (client) => {
      const row = await client.query(
        `INSERT INTO career_requests(requester_id, recipient_id, company_id, request_type, subject, job_url, resume_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.session.userId, recipientId, companyId, type, subject, jobUrl || null, req.file ? path.basename(req.file.path) : null]
      );
      const id = row.rows[0].id;
      await client.query(
        `INSERT INTO career_request_messages(request_id, sender_id, message) VALUES ($1, $2, $3)`,
        [id, req.session.userId, message]
      );
      await client.query(
        `INSERT INTO notifications(user_id, notification_type, title, body, reference_id)
         VALUES ($1, 'CAREER_REQUEST', 'New career request', $2, $3)`,
        [recipientId, `You received a ${type.toLowerCase().replaceAll('_', ' ')} request.`, id]
      );
      return id;
    });
    res.status(201).json({ id: created, message: 'Your private request has been sent.' });
  } catch (error) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    if (error.code === '23505') throw httpError(409, 'A similar pending request already exists.');
    throw error;
  }
}

router.get('/:id/resume', async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid request.');
  if (!(await canReadRequest(req.session.userId, req.params.id))) return res.status(404).json({ error: 'Request not found.' });
  const result = await pool.query('SELECT resume_path FROM career_requests WHERE id = $1', [req.params.id]);
  if (!result.rows[0]?.resume_path) return res.status(404).json({ error: 'This request has no resume attachment.' });
  res.download(path.join(__dirname, '..', '..', 'uploads', 'resumes', path.basename(result.rows[0].resume_path)), 'resume.pdf');
});

router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT cr.id, cr.requester_id, cr.recipient_id, cr.request_type, cr.subject, cr.job_url, cr.status, cr.created_at, cr.updated_at,
            requester.full_name AS requester_name, recipient.full_name AS recipient_name
     FROM career_requests cr JOIN users requester ON requester.id = cr.requester_id
     JOIN users recipient ON recipient.id = cr.recipient_id
     WHERE cr.requester_id = $1 OR cr.recipient_id = $1
     ORDER BY cr.updated_at DESC`, [req.session.userId]
  );
  res.json({ requests: result.rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid request.');
  if (!(await canReadRequest(req.session.userId, req.params.id))) return res.status(404).json({ error: 'Request not found.' });
  const result = await pool.query(
    `SELECT cr.*, requester.full_name AS requester_name, recipient.full_name AS recipient_name
     FROM career_requests cr JOIN users requester ON requester.id = cr.requester_id
     JOIN users recipient ON recipient.id = cr.recipient_id WHERE cr.id = $1`, [req.params.id]
  );
  const messages = await pool.query(
    `SELECT cm.id, cm.sender_id, u.full_name AS sender_name, cm.message, cm.attachment_path, cm.created_at
     FROM career_request_messages cm JOIN users u ON u.id = cm.sender_id
     WHERE cm.request_id = $1 ORDER BY cm.created_at`, [req.params.id]
  );
  const request = result.rows[0];
  request.has_resume = Boolean(request.resume_path);
  delete request.resume_path;
  res.json({ request, messages: messages.rows });
});

router.put('/:id/status', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid request.');
  const status = req.body.status;
  const allowed = ['ACCEPTED', 'DECLINED', 'NEEDS_INFORMATION', 'IN_PROGRESS', 'REFERRED', 'COMPLETED', 'CANCELLED'];
  if (!allowed.includes(status)) throw httpError(400, 'Choose a valid request status.');
  const recipientStatuses = ['ACCEPTED', 'DECLINED', 'NEEDS_INFORMATION', 'IN_PROGRESS', 'REFERRED', 'COMPLETED'];
  const nextStatuses = {
    PENDING: ['ACCEPTED', 'DECLINED', 'NEEDS_INFORMATION', 'CANCELLED'],
    ACCEPTED: ['IN_PROGRESS', 'NEEDS_INFORMATION', 'COMPLETED'],
    NEEDS_INFORMATION: ['ACCEPTED', 'DECLINED', 'COMPLETED'],
    IN_PROGRESS: ['NEEDS_INFORMATION', 'REFERRED', 'COMPLETED'],
    REFERRED: ['COMPLETED']
  };
  const request = await withTransaction(async (client) => {
    const result = await client.query('SELECT * FROM career_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
    const row = result.rows[0];
    if (!row) throw httpError(404, 'Request not found.');
    const canRespond = row.recipient_id === req.session.userId && recipientStatuses.includes(status);
    const canCancel = row.requester_id === req.session.userId && status === 'CANCELLED' && row.status === 'PENDING';
    if (!canRespond && !canCancel) throw httpError(403, 'You cannot make that change to this request.');
    if (!(nextStatuses[row.status] || []).includes(status)) throw httpError(409, 'That status change is not allowed from the current state.');
    await client.query('UPDATE career_requests SET status = $2, updated_at = now() WHERE id = $1', [row.id, status]);
    return row;
  });
  const notifyUser = request.requester_id === req.session.userId ? request.recipient_id : request.requester_id;
  await notify(notifyUser, 'CAREER_STATUS', 'Career request updated', `Request status changed to ${status.toLowerCase().replaceAll('_', ' ')}.`, request.id);
  res.json({ message: 'Request status updated.' });
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid request.');
  const message = text(req.body.message, 5000);
  if (message.length < 1) throw httpError(400, 'Write a message first.');
  if (!(await canReadRequest(req.session.userId, req.params.id))) return res.status(404).json({ error: 'Request not found.' });
  const request = await pool.query('SELECT requester_id, recipient_id, status FROM career_requests WHERE id = $1', [req.params.id]);
  if (['COMPLETED', 'CANCELLED', 'DECLINED'].includes(request.rows[0].status)) throw httpError(409, 'This request is closed.');
  const inserted = await pool.query(
    `INSERT INTO career_request_messages(request_id, sender_id, message) VALUES ($1, $2, $3) RETURNING id, created_at`,
    [req.params.id, req.session.userId, message]
  );
  const other = request.rows[0].requester_id === req.session.userId ? request.rows[0].recipient_id : request.rows[0].requester_id;
  await notify(other, 'CAREER_MESSAGE', 'New request message', 'You received a reply to a career request.', req.params.id);
  await pool.query('UPDATE career_requests SET updated_at = now() WHERE id = $1', [req.params.id]);
  res.status(201).json({ message: { id: inserted.rows[0].id, text: message, createdAt: inserted.rows[0].created_at } });
});

module.exports = router;
