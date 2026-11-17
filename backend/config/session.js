const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const pool = require('./db');

const PgStore = connectPgSimple(session);

module.exports = session({
  store: new PgStore({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: false
  }),
  name: 'rishihood.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.SESSION_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
});
