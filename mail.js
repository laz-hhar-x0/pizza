// mail.js — إرسال الإيميلات
// إذا ما حطيتش إعدادات SMTP في .env، الرمز يطلع في الكونسول (وضع التجريب).
// إذا حطيتهم، يبعث إيميل حقيقي (مجاني مع Gmail).
 
const nodemailer = require('nodemailer');
 
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
 

async function sendEmail(to, subject, text) {
  if (!transporter) {
    console.log('\n==============================');
    console.log('📧 (وضع التجريب) إيميل إلى ' + to);
    console.log(subject);
    console.log(text);
    console.log('==============================\n');
    return true;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
  return true;
}
 
module.exports = { sendEmail };
 