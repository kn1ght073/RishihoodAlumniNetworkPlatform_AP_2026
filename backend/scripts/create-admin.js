require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => terminal.question(question, resolve));
function askSecret(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return ask(`${question} (input visible without an interactive terminal): `);
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = '';
    const onData = (chunk) => {
      const char = chunk.toString();
      if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
      if (char === '\r' || char === '\n') {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
      } else if (char >= ' ') {
        value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

(async () => {
  try {
    const name = await ask('Admin full name: ');
    const emailInput = await ask('Admin email: ');
    const password = await askSecret('Admin password (10+ characters): ');
    const confirmation = await askSecret('Confirm password: ');
    const email = emailInput.trim().toLowerCase();
    if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a name and valid email.');
    if (password.length < 10 || password !== confirmation) throw new Error('Passwords must match and be at least 10 characters.');
    const exists = await pool.query(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'ADMIN' LIMIT 1`);
    if (exists.rowCount) throw new Error('An admin already exists. This setup command can only run once.');
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        `INSERT INTO users(full_name, email, password_hash, email_verified_at) VALUES ($1, $2, $3, now()) RETURNING id`,
        [name.trim(), email, hash]
      );
      const id = user.rows[0].id;
      await client.query('INSERT INTO profiles(user_id) VALUES ($1)', [id]);
      const adminRole = await client.query('INSERT INTO user_roles(user_id, role_id) SELECT $1, id FROM roles WHERE name = \'ADMIN\'', [id]);
      if (!adminRole.rowCount) throw new Error('Admin role is missing. Run database/seeds/seed.sql first.');
      await client.query('COMMIT');
      console.log(`Admin account created for ${email}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    terminal.close();
    await pool.end();
  }
})();
