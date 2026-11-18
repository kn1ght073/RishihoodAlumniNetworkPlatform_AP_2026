const crypto = require('crypto');

function createCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session && req.session.csrfToken;
  const supplied = req.get('x-csrf-token');
  const expectedBuffer = Buffer.from(expected || '');
  const suppliedBuffer = Buffer.from(supplied || '');
  if (!expected || !supplied || expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(403).json({ error: 'Session security token is missing or expired. Refresh and try again.' });
  }
  next();
}

module.exports = { createCsrfToken, csrfProtection };
