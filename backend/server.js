require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in backend/.env.');
}

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('./config/db');
const sessionMiddleware = require('./config/session');
const { csrfProtection } = require('./middleware/csrf');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const alumniRoutes = require('./routes/alumniRoutes');
const companyRoutes = require('./routes/companyRoutes');
const userRoutes = require('./routes/userRoutes');
const connectionRoutes = require('./routes/connectionRoutes');
const careerRoutes = require('./routes/careerRoutes');
const mentorshipRoutes = require('./routes/mentorshipRoutes');
const opportunityRoutes = require('./routes/opportunityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(sessionMiddleware);
app.use('/api', csrfProtection);
app.use('/api', (req, _res, next) => { req.db = pool; next(); });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Wait a few minutes and try again.' } });
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/resend-verification', authLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/ready', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ready', database: 'connected' }); }
  catch (_error) { res.status(503).json({ status: 'not_ready', database: 'unavailable' }); }
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/alumni', alumniRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/career-requests', careerRoutes);
app.use('/api/mentorship', mentorshipRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html'), (error) => {
  if (error && !res.headersSent) res.status(404).json({ error: 'Not found.' });
}));
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () => console.log(`Rishihood Alumni Network running at http://localhost:${port}`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
