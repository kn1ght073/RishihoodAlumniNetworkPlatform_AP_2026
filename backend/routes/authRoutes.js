const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { withTransaction } = require('../services/transactionService');
const { sendVerificationEmail } = require('../services/emailService');
const { createCsrfToken } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { text, httpError } = require('../utils/validation');

const router = express.Router();
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');
const isRishihoodEmail = (email) => /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*rishihood\.edu\.in$/.test(email);
const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate((error) => error ? reject(error) : resolve());
});

router.get('/csrf', (req, res) => res.json({ csrfToken: createCsrfToken(req) }));

router.post('/register', async (req, res) => {
  const fullName = text(req.body.fullName, 100);
  const email = text(req.body.email, 254).toLowerCase();
  const password = req.body.password;
  const userType = req.body.userType;
  const university = text(req.body.university, 100);
  const course = text(req.body.course, 120);
  const graduationYear = Number(req.body.graduationYear);

  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Enter your full name and a valid email address.');
  if (!isRishihoodEmail(email)) throw httpError(400, 'Use your Rishihood email address ending in rishihood.edu.in to create an account.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw httpError(400, 'Password must be between 10 and 128 characters.');
  if (!['STUDENT', 'ALUMNI'].includes(userType)) throw httpError(400, 'Choose Student or Alumni.');
  if (university !== 'Rishihood University') throw httpError(400, 'This network is for Rishihood University members.');
  if (course.length < 2 || !Number.isInteger(graduationYear) || graduationYear < 1950 || graduationYear > 2200) throw httpError(400, 'Enter your course and graduation year.');
  if (userType === 'STUDENT' && graduationYear < new Date().getFullYear()) throw httpError(400, 'Students should enter their expected graduation year.');
  if (userType === 'ALUMNI' && graduationYear > new Date().getFullYear()) throw httpError(400, 'Graduation year cannot be in the future.');
  const memberRole = await pool.query(`SELECT 1 FROM roles WHERE name = 'MEMBER'`);
  if (!memberRole.rowCount) throw httpError(503, 'The database role seed is missing. Run database/seeds/seed.sql and restart the API.');
  const passwordHash = await bcrypt.hash(password, 12);
  const token = crypto.randomBytes(24).toString('hex');
  const status = userType;
  let user;
  try {
    user = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users(full_name, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, full_name, email`,
        [fullName, email, passwordHash]
      );
      const created = inserted.rows[0];
      await client.query(
        `INSERT INTO university_memberships(user_id, membership_status, course, graduation_year, expected_graduation_year)
         VALUES ($1, $2, $3, $4, $5)`,
        [created.id, status, course, userType === 'ALUMNI' ? graduationYear : null, userType === 'STUDENT' ? graduationYear : null]
      );
      await client.query('INSERT INTO profiles(user_id) VALUES ($1)', [created.id]);
      await client.query('INSERT INTO career_preferences(user_id) VALUES ($1)', [created.id]);
      await client.query(
        `INSERT INTO user_roles(user_id, role_id) SELECT $1, id FROM roles WHERE name = 'MEMBER'`,
        [created.id]
      );
      await client.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 minutes')`,
        [created.id, digest(token)]
      );
      return created;
    });
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'An account with this email already exists.');
    throw error;
  }

  let emailSent = false;
  try { emailSent = await sendVerificationEmail(email, fullName, token); }
  catch (error) { console.error('Verification email delivery failed:', error.code || 'EMAIL_DELIVERY_ERROR'); }
  res.status(201).json({
    message: emailSent ? 'Account created. Check your email for a verification code.' : process.env.NODE_ENV === 'production' ? 'Account created, but verification email could not be delivered. Ask an administrator to resend it.' : 'Account created. Use the development verification code to continue.',
    emailSent,
    ...(process.env.NODE_ENV !== 'production' && !emailSent ? { developmentVerificationCode: token } : {})
  });
});

router.post('/resend-verification', async (req, res) => {
  const email = text(req.body.email, 254).toLowerCase();
  if (!isRishihoodEmail(email)) throw httpError(400, 'Use your Rishihood email address ending in rishihood.edu.in.');
  const result = await pool.query('SELECT id, full_name FROM users WHERE lower(trim(email)) = $1 AND email_verified_at IS NULL', [email]);
  if (!result.rowCount) return res.json({ message: 'If that account needs verification, a new code has been sent.' });
  const user = result.rows[0];
  const token = crypto.randomBytes(24).toString('hex');
  await withTransaction(async (client) => {
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [user.id]);
    await client.query(`INSERT INTO email_verification_tokens(user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 minutes')`, [user.id, digest(token)]);
  });
  let emailSent = false;
  try { emailSent = await sendVerificationEmail(email, user.full_name, token); }
  catch (error) { console.error('Verification email delivery failed:', error.code || 'EMAIL_DELIVERY_ERROR'); }
  res.json({ message: 'A new verification code was sent.', emailSent, ...(process.env.NODE_ENV !== 'production' && !emailSent ? { developmentVerificationCode: token } : {}) });
});

router.post('/verify-email', async (req, res) => {
  const token = text(req.body.token, 100);
  if (!token) throw httpError(400, 'Enter the verification code.');
  await withTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM email_verification_tokens WHERE token_hash = $1 AND expires_at > now()
       RETURNING user_id`,
      [digest(token)]
    );
    if (!result.rowCount) throw httpError(400, 'That verification code is invalid or expired.');
    await client.query('UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1', [result.rows[0].user_id]);
  });
  res.json({ message: 'Email verified. You can sign in now.' });
});

router.post('/login', async (req, res) => {
  const email = text(req.body.email, 254).toLowerCase();
  if (!isRishihoodEmail(email)) throw httpError(400, 'Use your Rishihood email address ending in rishihood.edu.in to sign in.');
  const password = req.body.password;
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.email_verified_at, u.account_status,
            m.membership_status,
            EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = 'ADMIN') AS is_admin
     FROM users u LEFT JOIN university_memberships m ON m.user_id = u.id
     WHERE lower(trim(u.email)) = $1`, [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) throw httpError(401, 'Email or password is incorrect.');
  if (user.account_status !== 'ACTIVE') throw httpError(403, 'This account is not active. Contact a university administrator.');
  if (!user.email_verified_at) throw httpError(403, 'Verify your email before signing in.');

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({
    user: { id: user.id, fullName: user.full_name, email: user.email, membershipStatus: user.membership_status, isAdmin: user.is_admin },
    csrfToken: req.session.csrfToken
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, m.membership_status, m.verification_status,
            EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = 'ADMIN') AS is_admin
     FROM users u LEFT JOIN university_memberships m ON m.user_id = u.id WHERE u.id = $1`,
    [req.session.userId]
  );
  if (!result.rowCount) return res.status(401).json({ error: 'Please sign in to continue.' });
  const row = result.rows[0];
  res.json({ user: { id: row.id, fullName: row.full_name, email: row.email, membershipStatus: row.membership_status, verificationStatus: row.verification_status, isAdmin: row.is_admin }, csrfToken: createCsrfToken(req) });
});

router.post('/logout', requireAuth, async (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('rishihood.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_SECURE === 'true' });
    res.json({ message: 'Signed out.' });
  });
});

module.exports = router;
