const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTransaction } = require('../services/transactionService');
const { uuid, text, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/dashboard', async (_req, res) => {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE account_status = 'ACTIVE') AS total_users,
       (SELECT count(*)::int FROM university_memberships WHERE membership_status = 'STUDENT') AS students,
       (SELECT count(*)::int FROM university_memberships WHERE membership_status = 'ALUMNI') AS alumni,
       (SELECT count(*)::int FROM verification_requests WHERE status = 'PENDING') AS pending_verifications,
       (SELECT count(*)::int FROM companies WHERE approved) AS companies,
       (SELECT count(*)::int FROM career_requests) AS career_requests,
       (SELECT count(*)::int FROM mentorship_requests) AS mentorship_requests,
       (SELECT count(*)::int FROM opportunities WHERE status = 'PUBLISHED') AS opportunities`
  );
  res.json({ statistics: result.rows[0] });
});

router.get('/career-requests', async (_req, res) => {
  const result = await pool.query(
    `SELECT cr.id, cr.request_type, cr.subject, cr.status, cr.created_at, cr.updated_at,
            requester.full_name AS requester_name, recipient.full_name AS recipient_name
     FROM career_requests cr JOIN users requester ON requester.id = cr.requester_id
     JOIN users recipient ON recipient.id = cr.recipient_id ORDER BY cr.updated_at DESC LIMIT 100`
  );
  res.json({ requests: result.rows });
});

router.get('/users', async (req, res) => {
  const search = text(req.query.search, 100);
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.account_status, u.email_verified_at, u.created_at,
            m.membership_status, m.course, m.graduation_year, m.expected_graduation_year, m.verification_status
     FROM users u LEFT JOIN university_memberships m ON m.user_id = u.id
     WHERE ($1 = '%%' OR u.full_name ILIKE $1 OR u.email ILIKE $1)
     ORDER BY u.created_at DESC LIMIT 200`, [`%${search}%`]
  );
  res.json({ users: result.rows });
});

router.put('/users/:id/status', async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid user.');
  const status = req.body.membershipStatus;
  if (!['STUDENT', 'ALUMNI'].includes(status)) throw httpError(400, 'Choose Student or Alumni membership.');
  const year = Number(req.body.graduationYear);
  if (!Number.isInteger(year) || year < 1950 || year > 2200) throw httpError(400, 'Enter a valid graduation year.');
  if (status === 'STUDENT' && year < new Date().getFullYear()) throw httpError(400, 'A student expected graduation year cannot be in the past.');
  if (status === 'ALUMNI' && year > new Date().getFullYear()) throw httpError(400, 'An alumni graduation year cannot be in the future.');
  const reason = text(req.body.reason, 500);
  if (reason.length < 5) throw httpError(400, 'Record a short reason for this membership change.');
  await withTransaction(async (client) => {
    const current = await client.query('SELECT membership_status FROM university_memberships WHERE user_id = $1 FOR UPDATE', [req.params.id]);
    if (!current.rowCount) throw httpError(404, 'Membership not found.');
    await client.query(
      `UPDATE university_memberships SET membership_status = $2, graduation_year = $3,
       expected_graduation_year = $4, verification_status = 'VERIFIED', verified_by = $5, verified_at = now(), updated_at = now()
       WHERE user_id = $1`,
      [req.params.id, status, status === 'ALUMNI' ? year : null, status === 'STUDENT' ? year : null, req.session.userId]
    );
    await client.query(
      `INSERT INTO audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'MEMBERSHIP_CHANGED', 'USER', $2, $3)`,
      [req.session.userId, req.params.id, `${current.rows[0].membership_status} to ${status}: ${reason}`]
    );
  });
  res.json({ message: 'Membership status updated. The existing user account and its history were preserved.' });
});

router.put('/users/:id/account', async (req, res) => {
  if (!uuid(req.params.id) || !['ACTIVE', 'SUSPENDED'].includes(req.body.accountStatus)) throw httpError(400, 'Choose Active or Suspended.');
  const reason = text(req.body.reason, 500);
  if (reason.length < 5) throw httpError(400, 'Record a short reason for this account change.');
  await withTransaction(async (client) => {
    const result = await client.query('UPDATE users SET account_status = $2, updated_at = now() WHERE id = $1 RETURNING id', [req.params.id, req.body.accountStatus]);
    if (!result.rowCount) throw httpError(404, 'User not found.');
    await client.query(`INSERT INTO audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'ACCOUNT_STATUS_CHANGED', 'USER', $2, $3)`, [req.session.userId, req.params.id, reason]);
  });
  res.json({ message: 'Account status updated.' });
});

router.get('/verifications', async (_req, res) => {
  const result = await pool.query(
    `SELECT vr.id, vr.user_id, vr.evidence_note, vr.document_path, vr.status, vr.created_at,
            u.full_name, u.email, m.membership_status, m.course, m.graduation_year, m.expected_graduation_year
     FROM verification_requests vr JOIN users u ON u.id = vr.user_id
     LEFT JOIN university_memberships m ON m.user_id = u.id
     WHERE vr.status = 'PENDING' ORDER BY vr.created_at`, []
  );
  res.json({ verifications: result.rows });
});

router.put('/verifications/:id', async (req, res) => {
  if (!uuid(req.params.id) || !['APPROVED', 'REJECTED'].includes(req.body.status)) throw httpError(400, 'Choose approve or reject.');
  const reason = text(req.body.reason, 500);
  if (req.body.status === 'REJECTED' && reason.length < 5) throw httpError(400, 'Add a reason when rejecting verification.');
  await withTransaction(async (client) => {
    const verification = await client.query('SELECT * FROM verification_requests WHERE id = $1 AND status = \'PENDING\' FOR UPDATE', [req.params.id]);
    if (!verification.rowCount) throw httpError(404, 'Pending verification not found.');
    const item = verification.rows[0];
    await client.query(
      `UPDATE verification_requests SET status = $2, admin_reason = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
      [item.id, req.body.status, reason || null, req.session.userId]
    );
    await client.query(
      `UPDATE university_memberships SET verification_status = $2, verified_by = $3, verified_at = now(), updated_at = now() WHERE user_id = $1`,
      [item.user_id, req.body.status === 'APPROVED' ? 'VERIFIED' : 'REJECTED', req.session.userId]
    );
    await client.query(`INSERT INTO audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'VERIFICATION_REVIEWED', 'VERIFICATION', $2, $3)`, [req.session.userId, item.id, reason || 'Approved']);
    await client.query(
      `INSERT INTO notifications(user_id, notification_type, title, body, reference_id) VALUES ($1, 'VERIFICATION', 'Affiliation review complete', $2, $3)`,
      [item.user_id, `Your university affiliation was ${req.body.status.toLowerCase()}.`, item.id]
    );
  });
  res.json({ message: `Verification ${req.body.status.toLowerCase()}.` });
});

router.get('/company-suggestions', async (_req, res) => {
  const result = await pool.query(
    `SELECT cs.id, cs.name, cs.website_url, cs.industry, cs.created_at, u.full_name AS submitted_by_name
     FROM company_suggestions cs JOIN users u ON u.id = cs.submitted_by
     WHERE cs.status = 'PENDING' ORDER BY cs.created_at`, []
  );
  res.json({ suggestions: result.rows });
});

router.put('/company-suggestions/:id', async (req, res) => {
  if (!uuid(req.params.id) || !['APPROVED', 'REJECTED'].includes(req.body.status)) throw httpError(400, 'Choose approve or reject.');
  const reason = text(req.body.reason, 500);
  let companyId = null;
  await withTransaction(async (client) => {
    const selected = await client.query('SELECT * FROM company_suggestions WHERE id = $1 AND status = \'PENDING\' FOR UPDATE', [req.params.id]);
    if (!selected.rowCount) throw httpError(404, 'Pending suggestion not found.');
    const suggestion = selected.rows[0];
    if (req.body.status === 'APPROVED') {
      const company = await client.query(
        `INSERT INTO companies(name, website_url, industry) VALUES ($1, $2, $3)
         ON CONFLICT (normalized_name) DO UPDATE SET name = companies.name RETURNING id`,
        [suggestion.name, suggestion.website_url, suggestion.industry]
      );
      companyId = company.rows[0].id;
    }
    await client.query('UPDATE company_suggestions SET status = $2, reviewed_by = $3, review_reason = $4, reviewed_at = now() WHERE id = $1', [suggestion.id, req.body.status, req.session.userId, reason || null]);
    await client.query(`INSERT INTO audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'COMPANY_SUGGESTION_REVIEWED', 'COMPANY_SUGGESTION', $2, $3)`, [req.session.userId, suggestion.id, reason || req.body.status]);
  });
  res.json({ message: `Company suggestion ${req.body.status.toLowerCase()}.`, companyId });
});

router.get('/companies', async (_req, res) => {
  const result = await pool.query('SELECT id, name, website_url, industry, description, location, size, approved FROM companies ORDER BY name LIMIT 500');
  res.json({ companies: result.rows });
});

router.put('/companies/:id', async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid company.');
  const name = text(req.body.name, 160);
  if (name.length < 2) throw httpError(400, 'Enter a company name.');
  const website = text(req.body.websiteUrl, 500);
  if (website && !/^https:\/\//i.test(website)) throw httpError(400, 'Company website must use HTTPS.');
  const values = [name, website || null, text(req.body.industry, 100) || null, text(req.body.description, 1000) || null, text(req.body.location, 120) || null, text(req.body.size, 80) || null, req.params.id];
  try {
    const result = await pool.query('UPDATE companies SET name = $1, website_url = $2, industry = $3, description = $4, location = $5, size = $6 WHERE id = $7 RETURNING id', values);
    if (!result.rowCount) return res.status(404).json({ error: 'Company not found.' });
    await pool.query(`INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES ($1, 'COMPANY_UPDATED', 'COMPANY', $2)`, [req.session.userId, req.params.id]);
    res.json({ message: 'Company updated.' });
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'A company with that name already exists.');
    throw error;
  }
});

router.get('/opportunities', async (req, res) => {
  const status = ['PUBLISHED', 'CLOSED', 'REMOVED'].includes(req.query.status) ? req.query.status : null;
  const result = await pool.query(
    `SELECT o.id, o.title, o.job_type, o.status, o.created_at, u.full_name AS publisher_name, c.name AS company_name
     FROM opportunities o JOIN users u ON u.id = o.publisher_id LEFT JOIN companies c ON c.id = o.company_id
     WHERE ($1::text IS NULL OR o.status = $1) ORDER BY o.created_at DESC LIMIT 200`, [status]
  );
  res.json({ opportunities: result.rows });
});

router.put('/opportunities/:id/moderate', async (req, res) => {
  if (!uuid(req.params.id) || !['CLOSED', 'REMOVED'].includes(req.body.status)) throw httpError(400, 'Choose close or remove.');
  const reason = text(req.body.reason, 500);
  if (reason.length < 5) throw httpError(400, 'Add a moderation reason.');
  await withTransaction(async (client) => {
    const result = await client.query('UPDATE opportunities SET status = $2, updated_at = now() WHERE id = $1 RETURNING id', [req.params.id, req.body.status]);
    if (!result.rowCount) throw httpError(404, 'Opportunity not found.');
    await client.query(`INSERT INTO audit_logs(actor_id, action, target_type, target_id, reason) VALUES ($1, 'OPPORTUNITY_MODERATED', 'OPPORTUNITY', $2, $3)`, [req.session.userId, req.params.id, reason]);
  });
  res.json({ message: 'Opportunity moderation recorded.' });
});

module.exports = router;
