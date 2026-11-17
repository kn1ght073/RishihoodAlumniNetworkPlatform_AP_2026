const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL connection error:', error.message);
});

module.exports = pool;
