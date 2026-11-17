const nodemailer = require('nodemailer');

async function sendVerificationEmail(email, name, token) {
  if (process.env.NODE_ENV === 'test') return false;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured.');
    console.log(`Development verification for ${email}: ${token}`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Verify your Rishihood Alumni Network account',
    text: `Hello ${name},\n\nYour account verification code is ${token}. It expires in 30 minutes.`
  });
  return true;
}

module.exports = { sendVerificationEmail };
