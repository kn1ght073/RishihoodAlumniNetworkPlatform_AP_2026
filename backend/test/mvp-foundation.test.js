const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { csrfProtection } = require('../middleware/csrf');
const { requireAuth, requireRole, requireVerifiedMember } = require('../middleware/auth');
const { uuid, text, httpError } = require('../utils/validation');

const root = path.join(__dirname, '..', '..');

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve({ status: this.statusCode, body }); }
    };
    middleware(req, res, (error) => error ? reject(error) : resolve({ status: 200, next: true }));
  });
}

test('validation helpers accept UUIDs and bound user-entered text', () => {
  assert.equal(uuid('7d0f834f-9d9a-4a3c-b9f4-7b5f0e5c2001'), true);
  assert.equal(uuid('not-a-uuid'), false);
  assert.equal(text('  alumni  '), 'alumni');
  assert.equal(text('abcdef', 3), 'abc');
  assert.equal(httpError(409, 'duplicate').status, 409);
});

test('CSRF middleware allows safe requests and rejects missing or incorrect tokens', async () => {
  const safe = await runMiddleware(csrfProtection, { method: 'GET', session: {} });
  const missing = await runMiddleware(csrfProtection, { method: 'POST', session: { csrfToken: 'a'.repeat(64) }, get: () => '' });
  const wrongLength = await runMiddleware(csrfProtection, { method: 'POST', session: { csrfToken: 'a'.repeat(64) }, get: () => 'short' });
  const valid = await runMiddleware(csrfProtection, { method: 'POST', session: { csrfToken: 'a'.repeat(64) }, get: () => 'a'.repeat(64) });
  assert.equal(safe.next, true);
  assert.equal(missing.status, 403);
  assert.equal(wrongLength.status, 403);
  assert.equal(valid.next, true);
});

test('authentication and administrator middleware enforce server-side authorization', async () => {
  const unauthenticated = await runMiddleware(requireAuth, { session: {} });
  const authenticated = await runMiddleware(requireAuth, { session: { userId: 'member-1' }, db: { query: async () => ({ rowCount: 1 }) } });
  const suspended = await runMiddleware(requireAuth, { session: { userId: 'member-2', destroy: (callback) => callback() }, db: { query: async () => ({ rowCount: 0 }) } });
  const memberRole = await runMiddleware(requireRole('ADMIN'), { session: { userId: 'member-1' }, db: { query: async () => ({ rowCount: 0 }) } });
  const adminRole = await runMiddleware(requireRole('ADMIN'), { session: { userId: 'admin-1' }, db: { query: async () => ({ rowCount: 1 }) } });
  assert.equal(unauthenticated.status, 401);
  assert.equal(authenticated.next, true);
  assert.equal(suspended.status, 401);
  assert.equal(memberRole.status, 403);
  assert.equal(adminRole.next, true);
});

test('unverified members cannot enter the private directory', async () => {
  const pending = await runMiddleware(requireVerifiedMember, { session: { userId: 'student-1' }, db: { query: async () => ({ rowCount: 1, rows: [{ verification_status: 'PENDING', is_admin: false }] }) } });
  const verified = await runMiddleware(requireVerifiedMember, { session: { userId: 'student-2' }, db: { query: async () => ({ rowCount: 1, rows: [{ verification_status: 'VERIFIED', is_admin: false }] }) } });
  const admin = await runMiddleware(requireVerifiedMember, { session: { userId: 'admin-1' }, db: { query: async () => ({ rowCount: 1, rows: [{ verification_status: null, is_admin: true }] }) } });
  assert.equal(pending.status, 403);
  assert.equal(verified.next, true);
  assert.equal(admin.next, true);
});

test('PostgreSQL schema contains the permanent identity and core network workflows', () => {
  const schema = fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8');
  for (const table of ['users', 'university_memberships', 'profiles', 'companies', 'employment_history', 'connections', 'career_requests', 'career_request_messages', 'mentorship_requests', 'opportunities', 'notifications', 'audit_logs', 'user_sessions']) {
    assert.match(schema, new RegExp(`CREATE TABLE ${table}\\s*\\(`));
  }
  assert.match(schema, /user_id UUID PRIMARY KEY REFERENCES users\(id\)/);
  assert.match(schema, /membership_status = 'STUDENT'/);
  assert.match(schema, /membership_status = 'ALUMNI'/);
  assert.doesNotMatch(schema, /DROP\s+DATABASE|TRUNCATE\s+/i);
});

test('frontend stays plain HTML, CSS, and JavaScript with the requested main pages', () => {
  const pages = ['index', 'login', 'register', 'dashboard', 'alumni', 'alumni-profile', 'companies', 'company-profile', 'opportunities', 'opportunity-details', 'profile', 'requests', 'mentorship', 'notifications', 'admin'];
  for (const page of pages) assert.ok(fs.existsSync(path.join(root, 'frontend', `${page}.html`)), `${page}.html should exist`);
  const files = fs.readdirSync(path.join(root, 'frontend', 'js')).filter((file) => file.endsWith('.js'));
  assert.ok(files.length >= 10);
  assert.equal(fs.existsSync(path.join(root, 'frontend', 'package.json')), false);
});
