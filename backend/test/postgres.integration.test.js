const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

test('PostgreSQL-backed member workflows complete end to end', { skip: !process.env.DATABASE_URL_TEST, timeout: 120000 }, async () => {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(databaseName, /_test$/, 'DATABASE_URL_TEST must point to a database whose name ends in _test');

  process.env.DATABASE_URL = databaseUrl;
  process.env.PORT = '0';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECURE = 'false';
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');

  const { Pool } = require('pg');
  const bcrypt = require('bcryptjs');
  const pool = new Pool({ connectionString: databaseUrl });
  const emailTag = crypto.randomBytes(5).toString('hex');
  const accounts = [];
  let companyId = null;
  let server;
  let request;
  try {
    const roles = await pool.query(`SELECT name FROM roles WHERE name IN ('MEMBER', 'ADMIN')`);
    assert.equal(roles.rowCount, 2, 'Apply database/seeds/seed.sql before running integration tests');
    ({ server } = require('../server'));
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;

    request = async (session, route, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const headers = new Headers(options.headers || {});
      let body = options.body;
      if (body && typeof body !== 'string' && !(body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(body);
      }
      if (session?.cookie) headers.set('Cookie', session.cookie);
      if (session?.csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', session.csrf);
      const response = await fetch(`${origin}/api${route}`, { method, headers, body });
      const cookie = response.headers.get('set-cookie');
      if (cookie && session) session.cookie = cookie.split(';')[0];
      const data = await response.json();
      if (data.csrfToken && session) session.csrf = data.csrfToken;
      return { response, data };
    };

    async function account(name, email, userType, year) {
      const session = {};
      const csrf = await request(session, '/auth/csrf');
      assert.equal(csrf.response.status, 200);
      const registered = await request(session, '/auth/register', {
        method: 'POST', body: { fullName: name, email, password: 'test-password-12345', userType, university: 'Rishihood University', course: 'Product Design', graduationYear: year }
      });
      assert.equal(registered.response.status, 201, registered.data.error);
      const verified = await request(session, '/auth/verify-email', { method: 'POST', body: { token: registered.data.developmentVerificationCode } });
      assert.equal(verified.response.status, 200, verified.data.error);
      const login = await request(session, '/auth/login', { method: 'POST', body: { email, password: 'test-password-12345' } });
      assert.equal(login.response.status, 200, login.data.error);
      accounts.push(login.data.user.id);
      return { session, user: login.data.user };
    }

    const suffix = `${emailTag}@rishihood.edu.in`;
    const student = await account('MVP Test Student', `student-${suffix}`, 'STUDENT', new Date().getFullYear() + 2);
    const alumnus = await account('MVP Test Alumnus', `alumni-${suffix}`, 'ALUMNI', new Date().getFullYear() - 2);

    const adminEmail = `admin-${suffix}`;
    const adminHash = await bcrypt.hash('test-admin-password-12345', 10);
    const adminId = (await pool.query(
      `INSERT INTO users(full_name, email, password_hash, email_verified_at) VALUES ('MVP Test Admin', $1, $2, now()) RETURNING id`,
      [adminEmail, adminHash]
    )).rows[0].id;
    accounts.push(adminId);
    await pool.query(`INSERT INTO profiles(user_id) VALUES ($1)`, [adminId]);
    await pool.query(`INSERT INTO user_roles(user_id, role_id) SELECT $1, id FROM roles WHERE name = 'ADMIN'`, [adminId]);
    const admin = { session: {} };
    await request(admin.session, '/auth/csrf');
    const adminLogin = await request(admin.session, '/auth/login', { method: 'POST', body: { email: adminEmail, password: 'test-admin-password-12345' } });
    assert.equal(adminLogin.response.status, 200, adminLogin.data.error);

    for (const member of [student, alumnus]) {
      const submission = await request(member.session, '/profile/verification', { method: 'POST', body: { evidenceNote: 'Created by the disposable PostgreSQL integration test.' } });
      assert.equal(submission.response.status, 201, submission.data.error);
    }
    const pending = await request(admin.session, '/admin/verifications');
    for (const item of pending.data.verifications.filter((row) => accounts.includes(row.user_id))) {
      const reviewed = await request(admin.session, `/admin/verifications/${item.id}`, { method: 'PUT', body: { status: 'APPROVED', reason: 'Integration fixture approval' } });
      assert.equal(reviewed.response.status, 200, reviewed.data.error);
    }

    const savedProfile = await request(alumnus.session, '/profile', { method: 'PUT', body: {
      fullName: 'MVP Test Alumnus', course: 'Product Design', bio: 'Happy to support students.', location: 'Sonipat', skills: ['Research', 'Product Design'],
      profileVisibility: 'MEMBERS', employmentVisibility: 'MEMBERS', contactVisibility: 'PRIVATE',
      preferences: { openToMentoring: true, openToCareerGuidance: true, openToReferrals: true, mentoringInterests: 'Portfolio and product thinking' }
    } });
    assert.equal(savedProfile.response.status, 200, savedProfile.data.error);

    const suggestion = await request(alumnus.session, '/companies/suggestions', { method: 'POST', body: { name: `Test Company ${emailTag}`, industry: 'Technology' } });
    assert.equal(suggestion.response.status, 201, suggestion.data.error);
    const suggestions = await request(admin.session, '/admin/company-suggestions');
    const companySuggestion = suggestions.data.suggestions.find((item) => item.id === suggestion.data.id);
    const approved = await request(admin.session, `/admin/company-suggestions/${companySuggestion.id}`, { method: 'PUT', body: { status: 'APPROVED', reason: 'Integration fixture' } });
    assert.equal(approved.response.status, 200, approved.data.error);
    companyId = approved.data.companyId;
    const employment = await request(alumnus.session, '/profile/employment', { method: 'POST', body: { companyId, jobTitle: 'Product Designer', isCurrent: true } });
    assert.equal(employment.response.status, 201, employment.data.error);
    const directory = await request(student.session, `/alumni?company=${encodeURIComponent(`Test Company ${emailTag}`)}`);
    assert.ok(directory.data.alumni.some((person) => person.id === alumnus.user.id));

    const connection = await request(student.session, '/connections/request', { method: 'POST', body: { recipientId: alumnus.user.id } });
    assert.equal(connection.response.status, 201, connection.data.error);
    const connectionList = await request(alumnus.session, '/connections/requests');
    const incomingConnection = connectionList.data.requests.find((item) => item.id === connection.data.id);
    const accepted = await request(alumnus.session, `/connections/requests/${incomingConnection.id}`, { method: 'PUT', body: { action: 'ACCEPTED' } });
    assert.equal(accepted.response.status, 200, accepted.data.error);

    const career = await request(student.session, '/career-requests', { method: 'POST', body: { recipientId: alumnus.user.id, requestType: 'CAREER_GUIDANCE', subject: 'Portfolio review', message: 'Could you review my portfolio direction and share suggestions?' } });
    assert.equal(career.response.status, 201, career.data.error);
    const careerStatus = await request(alumnus.session, `/career-requests/${career.data.id}/status`, { method: 'PUT', body: { status: 'ACCEPTED' } });
    assert.equal(careerStatus.response.status, 200, careerStatus.data.error);
    const reply = await request(alumnus.session, `/career-requests/${career.data.id}/messages`, { method: 'POST', body: { message: 'Please send the portfolio link when you are ready.' } });
    assert.equal(reply.response.status, 201, reply.data.error);

    const mentorship = await request(student.session, '/mentorship', { method: 'POST', body: { alumnusId: alumnus.user.id, goals: 'Learn how to prepare a product design portfolio.', topics: 'Portfolio, case studies' } });
    assert.equal(mentorship.response.status, 201, mentorship.data.error);
    const mentorshipStatus = await request(alumnus.session, `/mentorship/${mentorship.data.id}`, { method: 'PUT', body: { status: 'ACCEPTED' } });
    assert.equal(mentorshipStatus.response.status, 200, mentorshipStatus.data.error);

    const opportunity = await request(alumnus.session, '/opportunities', { method: 'POST', body: { companyId, title: 'Product Design Intern', description: 'Join our small product design team for a summer internship.', jobType: 'INTERNSHIP', workMode: 'HYBRID', location: 'Sonipat', applicationUrl: 'https://example.test/apply' } });
    assert.equal(opportunity.response.status, 201, opportunity.data.error);
    const opportunities = await request(student.session, '/opportunities');
    assert.ok(opportunities.data.opportunities.some((item) => item.id === opportunity.data.id));
    const saved = await request(student.session, `/opportunities/${opportunity.data.id}/save`, { method: 'POST' });
    assert.equal(saved.data.saved, true);

    const notifications = await request(alumnus.session, '/notifications');
    assert.ok(notifications.data.notifications.length >= 3);
    const statusChange = await request(admin.session, `/admin/users/${student.user.id}/status`, { method: 'PUT', body: { membershipStatus: 'ALUMNI', graduationYear: new Date().getFullYear(), reason: 'Integration lifecycle check' } });
    assert.equal(statusChange.response.status, 200, statusChange.data.error);
    const sameAccount = await request(student.session, '/auth/me');
    assert.equal(sameAccount.data.user.id, student.user.id);
    assert.equal(sameAccount.data.user.membershipStatus, 'ALUMNI');
  } finally {
    if (accounts.length) {
      await pool.query(`DELETE FROM user_sessions WHERE sess->>'userId' = ANY($1::text[])`, [accounts]).catch(() => {});
      await pool.query('DELETE FROM career_requests WHERE requester_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])', [accounts]).catch(() => {});
      await pool.query('DELETE FROM mentorship_requests WHERE student_id = ANY($1::uuid[]) OR alumnus_id = ANY($1::uuid[])', [accounts]).catch(() => {});
      await pool.query('DELETE FROM company_suggestions WHERE submitted_by = ANY($1::uuid[])', [accounts]).catch(() => {});
      await pool.query('DELETE FROM opportunities WHERE publisher_id = ANY($1::uuid[])', [accounts]).catch(() => {});
      await pool.query('DELETE FROM employment_history WHERE user_id = ANY($1::uuid[])', [accounts]).catch(() => {});
      if (companyId) await pool.query('DELETE FROM companies WHERE id = $1', [companyId]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [accounts]).catch(() => {});
    }
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
