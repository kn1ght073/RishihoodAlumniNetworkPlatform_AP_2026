const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { text, uuid, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireVerifiedMember);

router.get('/', requireAuth, async (req, res) => {
  const search = text(req.query.search, 120);
  const industry = text(req.query.industry, 100);
  const result = await pool.query(
    `SELECT c.id, c.name, c.website_url, c.industry, c.description, c.location, c.size, c.logo_path,
            COUNT(DISTINCT e.user_id) FILTER (
              WHERE m.user_id IS NOT NULL
                AND (p.profile_visibility = 'MEMBERS' OR (p.profile_visibility = 'CONNECTIONS' AND EXISTS (
                  SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, e.user_id) AND cn.member_high_id = GREATEST($1::uuid, e.user_id)
                )))
                AND (p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
                  SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, e.user_id) AND cn.member_high_id = GREATEST($1::uuid, e.user_id)
                )))
            )::int AS alumni_count
     FROM companies c LEFT JOIN employment_history e ON e.company_id = c.id AND e.is_current
     LEFT JOIN university_memberships m ON m.user_id = e.user_id AND m.membership_status = 'ALUMNI' AND m.verification_status = 'VERIFIED'
     LEFT JOIN profiles p ON p.user_id = e.user_id
     WHERE c.approved = TRUE AND ($2 = '%%' OR c.name ILIKE $2) AND ($3 = '%%' OR c.industry ILIKE $3)
     GROUP BY c.id ORDER BY alumni_count DESC, c.name LIMIT 100`,
    [req.session.userId, `%${search}%`, `%${industry}%`]
  );
  res.json({ companies: result.rows });
});

router.get('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid company.');
  const result = await pool.query(
    `SELECT id, name, website_url, industry, description, location, size, logo_path
     FROM companies WHERE id = $1 AND approved = TRUE`, [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Company not found.' });
  res.json({ company: result.rows[0] });
});

router.get('/:id/alumni', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid company.');
  const result = await pool.query(
    `SELECT u.id, u.full_name, p.avatar_path, p.bio, m.course, m.graduation_year, e.job_title,
            cp.open_to_mentoring, cp.open_to_career_guidance, cp.open_to_referrals, cp.mentoring_interests,
            COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id), '{}') AS skills
     FROM employment_history e JOIN companies c ON c.id = e.company_id
     JOIN users u ON u.id = e.user_id JOIN profiles p ON p.user_id = u.id
     JOIN university_memberships m ON m.user_id = u.id
     JOIN career_preferences cp ON cp.user_id = u.id
     WHERE e.company_id = $2 AND e.is_current = TRUE AND c.approved = TRUE
       AND u.account_status = 'ACTIVE' AND m.membership_status = 'ALUMNI' AND m.verification_status = 'VERIFIED'
       AND (p.profile_visibility = 'MEMBERS' OR (p.profile_visibility = 'CONNECTIONS' AND EXISTS (
         SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, u.id) AND cn.member_high_id = GREATEST($1::uuid, u.id)
       )))
       AND (p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
         SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, u.id) AND cn.member_high_id = GREATEST($1::uuid, u.id)
       )))
     ORDER BY u.full_name`, [req.session.userId, req.params.id]
  );
  res.json({ alumni: result.rows });
});

router.post('/suggestions', requireAuth, async (req, res) => {
  const name = text(req.body.name, 160);
  const website = text(req.body.websiteUrl, 500);
  const industry = text(req.body.industry, 100);
  if (name.length < 2) throw httpError(400, 'Enter a company name.');
  if (website && !/^https:\/\//i.test(website)) throw httpError(400, 'Company website must use HTTPS.');
  const existing = await pool.query('SELECT id FROM companies WHERE normalized_name = lower(trim($1))', [name]);
  if (existing.rowCount) throw httpError(409, 'That company already exists in the directory.');
  const duplicate = await pool.query(`SELECT id FROM company_suggestions WHERE normalized_name = lower(trim($1)) AND status = 'PENDING'`, [name]);
  if (duplicate.rowCount) throw httpError(409, 'A suggestion for this company is already awaiting review.');
  const result = await pool.query(
    `INSERT INTO company_suggestions(submitted_by, name, website_url, industry) VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.session.userId, name, website || null, industry || null]
  );
  res.status(201).json({ id: result.rows[0].id, message: 'Company suggestion sent for review.' });
});

module.exports = router;
