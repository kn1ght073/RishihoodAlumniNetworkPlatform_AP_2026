const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { uuid, text, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireVerifiedMember);

router.get('/', requireAuth, async (req, res) => {
  const search = text(req.query.search, 120);
  const jobType = ['JOB', 'INTERNSHIP', 'HIRING_ANNOUNCEMENT'].includes(req.query.jobType) ? req.query.jobType : null;
  const workMode = ['REMOTE', 'HYBRID', 'ONSITE'].includes(req.query.workMode) ? req.query.workMode : null;
  const location = text(req.query.location, 100);
  const result = await pool.query(
    `SELECT o.id, o.title, o.description, o.job_type, o.work_mode, o.location, o.application_url,
            o.eligibility, o.deadline, o.status, o.created_at, o.publisher_id, u.full_name AS publisher_name,
            c.id AS company_id, c.name AS company_name,
            EXISTS(SELECT 1 FROM saved_opportunities so WHERE so.user_id = $1 AND so.opportunity_id = o.id) AS saved
     FROM opportunities o JOIN users u ON u.id = o.publisher_id LEFT JOIN companies c ON c.id = o.company_id
     WHERE o.status = 'PUBLISHED' AND (o.deadline IS NULL OR o.deadline >= CURRENT_DATE)
       AND ($2 = '%%' OR o.title ILIKE $2 OR c.name ILIKE $2)
       AND ($3::text IS NULL OR o.job_type = $3) AND ($4::text IS NULL OR o.work_mode = $4)
       AND ($5 = '%%' OR o.location ILIKE $5)
     ORDER BY o.created_at DESC LIMIT 100`,
    [req.session.userId, `%${search}%`, jobType, workMode, `%${location}%`]
  );
  res.json({ opportunities: result.rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid opportunity.');
  const result = await pool.query(
    `SELECT o.*, u.full_name AS publisher_name, c.name AS company_name,
            EXISTS(SELECT 1 FROM saved_opportunities so WHERE so.user_id = $1 AND so.opportunity_id = o.id) AS saved
     FROM opportunities o JOIN users u ON u.id = o.publisher_id LEFT JOIN companies c ON c.id = o.company_id
     WHERE o.id = $2 AND (o.status = 'PUBLISHED' OR o.publisher_id = $1)`, [req.session.userId, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Opportunity not found.' });
  res.json({ opportunity: result.rows[0] });
});

router.post('/', requireAuth, async (req, res) => {
  const membership = await pool.query(`SELECT membership_status, verification_status FROM university_memberships WHERE user_id = $1`, [req.session.userId]);
  if (membership.rows[0]?.membership_status !== 'ALUMNI' || membership.rows[0]?.verification_status !== 'VERIFIED') throw httpError(403, 'Only verified alumni can post opportunities.');
  const title = text(req.body.title, 180);
  const description = text(req.body.description, 5000);
  const jobType = req.body.jobType;
  const workMode = req.body.workMode || 'ONSITE';
  const companyId = req.body.companyId || null;
  if (title.length < 3 || description.length < 10) throw httpError(400, 'Enter a title and opportunity description.');
  if (!['JOB', 'INTERNSHIP', 'HIRING_ANNOUNCEMENT'].includes(jobType) || !['REMOTE', 'HYBRID', 'ONSITE'].includes(workMode)) throw httpError(400, 'Choose a valid job type and work arrangement.');
  if (companyId && !uuid(companyId)) throw httpError(400, 'Invalid company.');
  if (companyId) {
    const company = await pool.query('SELECT 1 FROM companies WHERE id = $1 AND approved = TRUE', [companyId]);
    if (!company.rowCount) throw httpError(400, 'Choose an approved company.');
  }
  const url = text(req.body.applicationUrl, 1000);
  if (url && !/^https:\/\//i.test(url)) throw httpError(400, 'Application link must use HTTPS.');
  const deadline = req.body.deadline || null;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw httpError(400, 'Enter a valid deadline.');
  const result = await pool.query(
    `INSERT INTO opportunities(publisher_id, company_id, title, description, job_type, work_mode, location, application_url, eligibility, deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [req.session.userId, companyId, title, description, jobType, workMode, text(req.body.location, 120) || null, url || null, text(req.body.eligibility, 500) || null, deadline]
  );
  res.status(201).json({ id: result.rows[0].id, message: 'Opportunity published.' });
});

router.put('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid opportunity.');
  const title = text(req.body.title, 180);
  const description = text(req.body.description, 5000);
  const jobType = req.body.jobType;
  const workMode = req.body.workMode;
  const status = ['PUBLISHED', 'CLOSED'].includes(req.body.status) ? req.body.status : 'PUBLISHED';
  if (title.length < 3 || description.length < 10 || !['JOB', 'INTERNSHIP', 'HIRING_ANNOUNCEMENT'].includes(jobType) || !['REMOTE', 'HYBRID', 'ONSITE'].includes(workMode)) throw httpError(400, 'Complete all required opportunity fields.');
  const companyId = req.body.companyId || null;
  if (companyId && !uuid(companyId)) throw httpError(400, 'Invalid company.');
  if (companyId) {
    const company = await pool.query('SELECT 1 FROM companies WHERE id = $1 AND approved = TRUE', [companyId]);
    if (!company.rowCount) throw httpError(400, 'Choose an approved company.');
  }
  const applicationUrl = text(req.body.applicationUrl, 1000);
  if (applicationUrl && !/^https:\/\//i.test(applicationUrl)) throw httpError(400, 'Application link must use HTTPS.');
  const deadline = req.body.deadline || null;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw httpError(400, 'Enter a valid deadline.');
  const result = await pool.query(
    `UPDATE opportunities SET company_id = $3, title = $4, description = $5, job_type = $6, work_mode = $7, location = $8,
       application_url = $9, eligibility = $10, deadline = $11, status = $12, updated_at = now()
     WHERE id = $1 AND (publisher_id = $2 OR EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $2 AND r.name = 'ADMIN')) RETURNING id`,
    [req.params.id, req.session.userId, companyId, title, description, jobType, workMode, text(req.body.location, 120) || null, applicationUrl || null, text(req.body.eligibility, 500) || null, deadline, status]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Opportunity not found or you do not own it.' });
  res.json({ message: 'Opportunity updated.' });
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid opportunity.');
  const result = await pool.query(
    `UPDATE opportunities SET status = 'REMOVED', updated_at = now() WHERE id = $1 AND
     (publisher_id = $2 OR EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $2 AND r.name = 'ADMIN')) RETURNING id`,
    [req.params.id, req.session.userId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Opportunity not found or you do not own it.' });
  res.json({ message: 'Opportunity removed.' });
});

router.post('/:id/save', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid opportunity.');
  const result = await pool.query(
    `INSERT INTO saved_opportunities(user_id, opportunity_id)
     SELECT $1, id FROM opportunities WHERE id = $2 AND status = 'PUBLISHED'
     ON CONFLICT DO NOTHING RETURNING opportunity_id`, [req.session.userId, req.params.id]
  );
  if (!result.rowCount) {
    const exists = await pool.query('SELECT 1 FROM saved_opportunities WHERE user_id = $1 AND opportunity_id = $2', [req.session.userId, req.params.id]);
    if (exists.rowCount) {
      await pool.query('DELETE FROM saved_opportunities WHERE user_id = $1 AND opportunity_id = $2', [req.session.userId, req.params.id]);
      return res.json({ saved: false });
    }
    return res.status(404).json({ error: 'Opportunity not found.' });
  }
  res.json({ saved: true });
});

module.exports = router;
