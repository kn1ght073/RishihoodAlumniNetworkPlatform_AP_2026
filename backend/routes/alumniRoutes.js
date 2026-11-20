const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireVerifiedMember } = require('../middleware/auth');
const { text, uuid, httpError } = require('../utils/validation');

const router = express.Router();
router.use(requireAuth, requireVerifiedMember);

const connectionCheck = `EXISTS (
  SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
)`;
const employmentVisible = `(p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND ${connectionCheck}))`;

router.get('/', requireAuth, async (req, res) => {
  const search = text(req.query.search, 100);
  const company = text(req.query.company, 100);
  const jobTitle = text(req.query.jobTitle, 100);
  const location = text(req.query.location, 100);
  const industry = text(req.query.industry, 100);
  const course = text(req.query.course, 120);
  const skill = text(req.query.skill, 60);
  const year = Number(req.query.graduationYear) || null;
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 12));
  const sort = { name: 'u.full_name ASC', year: 'm.graduation_year DESC NULLS LAST', recent: 'u.created_at DESC' }[req.query.sort] || 'u.full_name ASC';
  const values = [req.session.userId, `%${search}%`, `%${company}%`, `%${jobTitle}%`, `%${location}%`, `%${industry}%`, `%${course}%`, `%${skill}%`, year, limit, (page - 1) * limit];

  const result = await pool.query(
    `SELECT u.id, u.full_name, p.avatar_path, p.bio, p.current_location, p.profile_visibility,
            p.employment_visibility, m.course, m.graduation_year, cp.open_to_mentoring, cp.mentoring_interests,
            cp.open_to_career_guidance, cp.open_to_referrals,
            CASE WHEN ${employmentVisible} THEN co.name END AS company_name,
            CASE WHEN ${employmentVisible} THEN e.job_title END AS job_title,
            COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id), '{}') AS skills
     FROM users u JOIN profiles p ON p.user_id = u.id
     JOIN university_memberships m ON m.user_id = u.id
     JOIN career_preferences cp ON cp.user_id = u.id
     LEFT JOIN employment_history e ON e.user_id = u.id AND e.is_current = TRUE
     LEFT JOIN companies co ON co.id = e.company_id
     WHERE m.membership_status = 'ALUMNI' AND m.verification_status = 'VERIFIED' AND u.account_status = 'ACTIVE'
       AND p.profile_visibility <> 'PRIVATE'
       AND (p.profile_visibility = 'MEMBERS' OR ${connectionCheck} OR u.id = $1)
       AND ($2 = '%%' OR u.full_name ILIKE $2 OR m.course ILIKE $2 OR (${employmentVisible} AND (co.name ILIKE $2 OR e.job_title ILIKE $2)))
       AND ($3 = '%%' OR (${employmentVisible} AND co.name ILIKE $3))
       AND ($4 = '%%' OR (${employmentVisible} AND e.job_title ILIKE $4))
       AND ($5 = '%%' OR p.current_location ILIKE $5)
       AND ($6 = '%%' OR (${employmentVisible} AND co.industry ILIKE $6))
       AND ($7 = '%%' OR m.course ILIKE $7)
       AND ($8 = '%%' OR EXISTS (SELECT 1 FROM user_skills sx JOIN skills sk ON sk.id = sx.skill_id WHERE sx.user_id = u.id AND sk.name ILIKE $8))
       AND ($9::smallint IS NULL OR m.graduation_year = $9)
     GROUP BY u.id, p.user_id, m.user_id, cp.user_id, e.id, co.id
     ORDER BY ${sort} LIMIT $10 OFFSET $11`, values
  );
  res.json({ alumni: result.rows, page, limit });
});

router.get('/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid alumni profile.');
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, p.*, m.university, m.course, m.membership_status, m.graduation_year,
            m.verification_status, cp.open_to_mentoring, cp.open_to_career_guidance, cp.open_to_referrals, cp.mentoring_interests,
            COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id), '{}') AS skills,
            EXISTS (SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)) AS connected
     FROM users u JOIN profiles p ON p.user_id = u.id JOIN university_memberships m ON m.user_id = u.id
     JOIN career_preferences cp ON cp.user_id = u.id
     WHERE u.id = $2 AND u.account_status = 'ACTIVE' AND m.membership_status = 'ALUMNI' AND m.verification_status = 'VERIFIED'`, [req.session.userId, req.params.id]
  );
  const profile = result.rows[0];
  if (!profile) return res.status(404).json({ error: 'Alumni profile not found.' });
  const isSelf = profile.id === req.session.userId;
  if (profile.profile_visibility === 'PRIVATE' && !isSelf) return res.status(404).json({ error: 'Alumni profile not found.' });
  if (profile.profile_visibility === 'CONNECTIONS' && !isSelf && !profile.connected) return res.status(404).json({ error: 'Alumni profile not found.' });

  let employment = [];
  if (isSelf || profile.employment_visibility === 'MEMBERS' || (profile.employment_visibility === 'CONNECTIONS' && profile.connected)) {
    const jobs = await pool.query(
      `SELECT e.id, e.job_title, e.started_on, e.ended_on, e.is_current, e.verified, c.id AS company_id, c.name AS company_name
       FROM employment_history e JOIN companies c ON c.id = e.company_id WHERE e.user_id = $1 ORDER BY e.is_current DESC, e.started_on DESC NULLS LAST`, [profile.id]
    );
    employment = jobs.rows;
  }
  const contactEmail = isSelf || profile.contact_visibility === 'MEMBERS' || (profile.contact_visibility === 'CONNECTIONS' && profile.connected) ? profile.email : null;
  delete profile.email;
  res.json({ profile: { ...profile, email: contactEmail }, employment });
});

module.exports = router;
