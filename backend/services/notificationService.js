const pool = require('../config/db');

async function notify(userId, type, title, body, referenceId = null) {
  await pool.query(
    `INSERT INTO notifications(user_id, notification_type, title, body, reference_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, body, referenceId]
  );
}

module.exports = { notify };
