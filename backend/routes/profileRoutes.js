const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { withTransaction } = require('../services/transactionService');
const { text, uuid, httpError } = require('../utils/validation');

const router = express.Router();
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads'),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 2, fieldSize: 2 * 1024, parts: 3 },
  fileFilter(_req, file, done) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(httpError(400, 'Use a JPG, PNG, or WebP image under 3 MB.'));
    done(null, true);
  }
});

function safeLink(value, label) {
  const link = text(value, 500);
  if (!link) return null;
  try {
    const parsed = new URL(link);
    if (parsed.protocol !== 'https:') throw new Error();
    return parsed.toString();
  } catch (_error) {
    throw httpError(400, `${label} must be a valid HTTPS URL.`);
  }
}

router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT u.full_name, u.email, p.*, m.university, m.course, m.membership_status, m.graduation_year, m.expected_graduation_year, m.verification_status,
            cp.open_to_mentoring, cp.open_to_career_guidance, cp.open_to_referrals, cp.mentoring_interests,
            COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
     FROM users u JOIN profiles p ON p.user_id = u.id
     JOIN university_memberships m ON m.user_id = u.id
     JOIN career_preferences cp ON cp.user_id = u.id
     LEFT JOIN user_skills us ON us.user_id = u.id LEFT JOIN skills s ON s.id = us.skill_id
     WHERE u.id = $1 GROUP BY u.id, p.user_id, m.user_id, cp.user_id`,
    [req.session.userId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Profile not found.' });
  const employment = await pool.query(
    `SELECT e.id, e.job_title, e.started_on, e.ended_on, e.is_current, e.verified, c.id AS company_id, c.name AS company_name
     FROM employment_history e JOIN companies c ON c.id = e.company_id WHERE e.user_id = $1 ORDER BY e.is_current DESC, e.started_on DESC NULLS LAST`,
    [req.session.userId]
  );
  res.json({ profile: result.rows[0], employment: employment.rows });
});

router.put('/', requireAuth, async (req, res) => {
  const fullName = text(req.body.fullName, 100);
  const bio = text(req.body.bio, 1200);
  const location = text(req.body.location, 120);
  const course = text(req.body.course, 120);
  const linkedin = safeLink(req.body.linkedinUrl, 'LinkedIn URL');
  const github = safeLink(req.body.githubUrl, 'GitHub URL');
  const portfolio = safeLink(req.body.portfolioUrl, 'Portfolio URL');
  const profileVisibility = req.body.profileVisibility;
  const employmentVisibility = req.body.employmentVisibility;
  const contactVisibility = req.body.contactVisibility;
  const skills = Array.isArray(req.body.skills) ? [...new Set(req.body.skills.map((value) => text(value, 40).toLowerCase()).filter(Boolean))].slice(0, 30) : [];
  if (fullName.length < 2 || course.length < 2) throw httpError(400, 'Name and course are required.');
  for (const value of [profileVisibility, employmentVisibility, contactVisibility]) {
    if (!['MEMBERS', 'CONNECTIONS', 'PRIVATE'].includes(value)) throw httpError(400, 'Choose a valid privacy setting.');
  }
  const preferences = req.body.preferences || {};
  for (const key of ['openToMentoring', 'openToCareerGuidance', 'openToReferrals']) {
    if (typeof preferences[key] !== 'boolean') throw httpError(400, 'Choose valid career availability settings.');
  }
  const interests = text(preferences.mentoringInterests, 500);

  await withTransaction(async (client) => {
    await client.query('UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1', [req.session.userId, fullName]);
    await client.query(
      `UPDATE profiles SET current_location = $2, bio = $3, linkedin_url = $4, github_url = $5, portfolio_url = $6,
       profile_visibility = $7, employment_visibility = $8, contact_visibility = $9, updated_at = now() WHERE user_id = $1`,
      [req.session.userId, location || null, bio || null, linkedin, github, portfolio, profileVisibility, employmentVisibility, contactVisibility]
    );
    await client.query('UPDATE university_memberships SET course = $2, updated_at = now() WHERE user_id = $1', [req.session.userId, course]);
    await client.query(
      `UPDATE career_preferences SET open_to_mentoring = $2, open_to_career_guidance = $3, open_to_referrals = $4,
       mentoring_interests = $5, updated_at = now() WHERE user_id = $1`,
      [req.session.userId, preferences.openToMentoring, preferences.openToCareerGuidance, preferences.openToReferrals, interests]
    );
    await client.query('DELETE FROM user_skills WHERE user_id = $1', [req.session.userId]);
    for (const skill of skills) {
      const inserted = await client.query('INSERT INTO skills(name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [skill]);
      await client.query('INSERT INTO user_skills(user_id, skill_id) VALUES ($1, $2)', [req.session.userId, inserted.rows[0].id]);
    }
  });
  res.json({ message: 'Profile saved.' });
});

router.post('/picture', requireAuth, upload.single('picture'), async (req, res) => {
  if (!req.file) throw httpError(400, 'Choose an image to upload.');
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
  const fs = require('fs/promises');
  const signature = await fs.readFile(req.file.path);
  const validImage = (ext === '.jpg' && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff)
    || (ext === '.png' && signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (ext === '.webp' && signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP');
  if (!validImage) {
    await fs.unlink(req.file.path);
    throw httpError(400, 'The uploaded file is not a valid JPG, PNG, or WebP image.');
  }
  const newPath = `${req.file.filename}${ext}`;
  const current = await pool.query('SELECT avatar_path FROM profiles WHERE user_id = $1', [req.session.userId]);
  await fs.rename(req.file.path, `${req.file.path}${ext}`);
  await pool.query('UPDATE profiles SET avatar_path = $2, updated_at = now() WHERE user_id = $1', [req.session.userId, newPath]);
  if (current.rows[0]?.avatar_path) fs.unlink(path.join(__dirname, '..', '..', 'uploads', path.basename(current.rows[0].avatar_path))).catch(() => {});
  res.json({ pictureUrl: `/api/users/${req.session.userId}/picture` });
});

router.post('/employment', requireAuth, async (req, res) => {
  const companyId = req.body.companyId;
  const title = text(req.body.jobTitle, 120);
  if (!uuid(companyId) || title.length < 2) throw httpError(400, 'Choose a company and enter your job title.');
  const member = await pool.query('SELECT membership_status FROM university_memberships WHERE user_id = $1', [req.session.userId]);
  if (member.rows[0]?.membership_status !== 'ALUMNI') throw httpError(403, 'Only alumni can add employment history.');
  const { startedOn, endedOn, isCurrent } = req.body;
  const validDate = (value) => {
    if (!value) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(startedOn) || !validDate(endedOn) || (startedOn && endedOn && endedOn < startedOn)) throw httpError(400, 'Enter valid employment dates.');
  if (typeof isCurrent !== 'boolean') throw httpError(400, 'Choose whether this is your current role.');
  const company = await pool.query('SELECT 1 FROM companies WHERE id = $1 AND approved = TRUE', [companyId]);
  if (!company.rowCount) throw httpError(400, 'Choose an approved company.');
  const result = await pool.query(
    `INSERT INTO employment_history(user_id, company_id, job_title, started_on, ended_on, is_current)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.session.userId, companyId, title, startedOn || null, isCurrent ? null : (endedOn || null), isCurrent]
  );
  res.status(201).json({ id: result.rows[0].id, message: 'Employment added.' });
});

router.delete('/employment/:id', requireAuth, async (req, res) => {
  if (!uuid(req.params.id)) throw httpError(400, 'Invalid employment record.');
  const result = await pool.query('DELETE FROM employment_history WHERE id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
  if (!result.rowCount) return res.status(404).json({ error: 'Employment record not found.' });
  res.json({ message: 'Employment removed.' });
});

router.post('/verification', requireAuth, async (req, res) => {
  const evidence = text(req.body.evidenceNote, 1200);
  if (evidence.length < 5) throw httpError(400, 'Describe how the university can verify your affiliation.');
  const result = await pool.query(
    `INSERT INTO verification_requests(user_id, evidence_note) VALUES ($1, $2)
     ON CONFLICT (user_id) WHERE status = 'PENDING' DO NOTHING RETURNING id`,
    [req.session.userId, evidence]
  );
  if (!result.rowCount) throw httpError(409, 'A verification request is already awaiting review.');
  res.status(201).json({ id: result.rows[0].id, message: 'Verification request submitted.' });
});

module.exports = router;
