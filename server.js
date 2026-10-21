// require('dotenv').config();
// const express = require('express');
// const cookieParser = require('cookie-parser');
// const rateLimit = require('express-rate-limit');
// const crypto = require('crypto');
// const fs = require('fs');
// const path = require('path');
// const { sendEmail } = require('./mail');
 
// const app = express();
// const PORT = process.env.PORT || 3000;
// const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// if (!process.env.SESSION_SECRET) {
//   console.warn('⚠️  SESSION_SECRET غير موجود في .env — راح يتبدل كل مرة تعاود تشغل السيرفر.');
// }
 
// const OTP_TTL_MS = 5 * 60 * 1000;
// const RESEND_COOLDOWN_S = 60;
// const MAX_ATTEMPTS = 5;
// const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
 
// app.use(express.json({ limit: '10kb' }));
// app.use(cookieParser());
 
// // ---------- Helpers ----------
// const PHONE_RE = /^(?:\+213|00213|0)([567])\d{8}$/;
// const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
 
// function normalizePhone(input) {
//   const cleaned = String(input || '').replace(/[\s.\-()]/g, '');
//   if (!PHONE_RE.test(cleaned)) return null;
//   return '+213' + cleaned.replace(/^(?:\+213|00213|0)/, '');
// }
 
// function normalizeEmail(input) {
//   const e = String(input || '').trim().toLowerCase();
//   if (e.length > 120 || !EMAIL_RE.test(e)) return null;
//   return e;
// }
 
// function cleanName(input) {
//   const name = String(input || '').trim().replace(/\s+/g, ' ');
//   if (name.length < 2 || name.length > 50) return null;
//   if (!/^[\p{L}\s'’-]+$/u.test(name)) return null;
//   return name;
// }
 
// function sign(payload) {
//   const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
//   const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
//   return `${body}.${sig}`;
// }
 
// function verifyToken(token) {
//   if (!token || typeof token !== 'string' || !token.includes('.')) return null;
//   const [body, sig] = token.split('.');
//   const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
//   const a = Buffer.from(sig);
//   const b = Buffer.from(expected);
//   if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
//   try {
//     const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
//     if (!payload.exp || payload.exp < Date.now()) return null;
//     return payload;
//   } catch {
//     return null;
//   }
// }
 
// function getSession(req) {
//   return verifyToken(req.cookies.session);
// }
 
// // ---------- Users storage (JSON file) ----------
// const DATA_DIR = path.join(__dirname, 'data');
// const USERS_FILE = path.join(DATA_DIR, 'users.json');
 
// function saveUser(email, name, phone) {
//   try {
//     fs.mkdirSync(DATA_DIR, { recursive: true });
//     let users = {};
//     if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
//     users[email] = { name, phone, lastLogin: new Date().toISOString() };
//     fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
//   } catch (e) {
//     console.error('تعذر حفظ المستخدم:', e.message);
//   }
// }
 
// // ---------- OTP store (in memory) ----------
// const otps = new Map(); // email -> {code, name, phone, expires, attempts, lastSent}
 
// setInterval(() => {
//   const now = Date.now();
//   for (const [email, rec] of otps) if (rec.expires < now) otps.delete(email);
// }, 60 * 1000).unref();
 
// // ---------- Rate limiting ----------
// const otpLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 20,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { ok: false, error: 'محاولات كثيرة، حاول مرة أخرى بعد قليل.' },
// });
 
// // ---------- API ----------
// app.post('/api/send-otp', otpLimiter, async (req, res) => {
//   const name = cleanName(req.body.name);
//   const phone = normalizePhone(req.body.phone);
//   const email = normalizeEmail(req.body.email);
//   if (!name) return res.status(400).json({ ok: false, field: 'name', error: 'الاسم لازم يكون حرفين على الأقل (حروف فقط).' });
//   if (!phone) return res.status(400).json({ ok: false, field: 'phone', error: 'رقم الهاتف غير صحيح. مثال: 0555123456' });
//   if (!email) return res.status(400).json({ ok: false, field: 'email', error: 'الإيميل غير صحيح. مثال: name@gmail.com' });
 
//   const existing = otps.get(email);
//   if (existing) {
//     const wait = RESEND_COOLDOWN_S - Math.floor((Date.now() - existing.lastSent) / 1000);
//     if (wait > 0) {
//       return res.status(429).json({ ok: false, error: `انتظر ${wait} ثانية قبل إعادة الإرسال.`, retryAfter: wait });
//     }
//   }
 
//   const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
//   otps.set(email, { code, name, phone, expires: Date.now() + OTP_TTL_MS, attempts: 0, lastSent: Date.now() });
 
//   try {
//     await sendEmail(
//       email,
//       'رمز التحقق الخاص بك',
//       `مرحبا ${name}،\n\nرمز التحقق الخاص بك هو: ${code}\nالرمز صالح لمدة 5 دقائق.\n\nإذا لم تطلب هذا الرمز تجاهل الرسالة.`
//     );
//   } catch (e) {
//     console.error('Email error:', e.message);
//     otps.delete(email);
//     return res.status(502).json({ ok: false, error: 'تعذر إرسال الإيميل، تأكد من الإعدادات وحاول لاحقا.' });
//   }
 
//   // لا نرسل الرمز للمتصفح أبدا
//   res.json({ ok: true, email, cooldown: RESEND_COOLDOWN_S });
// });
 
// app.post('/api/verify-otp', otpLimiter, (req, res) => {
//   const email = normalizeEmail(req.body.email);
//   const code = String(req.body.code || '').trim();
//   if (!email) return res.status(400).json({ ok: false, error: 'الإيميل غير صحيح.' });
//   if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok: false, error: 'الرمز لازم يكون 6 أرقام.' });
 
//   const rec = otps.get(email);
//   if (!rec) return res.status(400).json({ ok: false, error: 'ما كاش رمز نشط. اطلب رمز جديد.' });
//   if (rec.expires < Date.now()) {
//     otps.delete(email);
//     return res.status(400).json({ ok: false, error: 'انتهت صلاحية الرمز. اطلب رمز جديد.' });
//   }
//   if (rec.attempts >= MAX_ATTEMPTS) {
//     otps.delete(email);
//     return res.status(429).json({ ok: false, error: 'تجاوزت عدد المحاولات. اطلب رمز جديد.' });
//   }
 
//   const a = Buffer.from(code);
//   const b = Buffer.from(rec.code);
//   if (!crypto.timingSafeEqual(a, b)) {
//     rec.attempts += 1;
//     const left = MAX_ATTEMPTS - rec.attempts;
//     return res.status(400).json({ ok: false, error: `الرمز غير صحيح. بقاولك ${left} محاولات.` });
//   }
 
//   otps.delete(email);
//   saveUser(email, rec.name, rec.phone);
//   const token = sign({ name: rec.name, phone: rec.phone, email, exp: Date.now() + SESSION_TTL_MS });
//   res.cookie('session', token, {
//     httpOnly: true,
//     sameSite: 'lax',
//     secure: process.env.NODE_ENV === 'production',
//     maxAge: SESSION_TTL_MS,
//   });
//   res.json({ ok: true, redirect: '/welcome' });
// });
 
// app.get('/api/me', (req, res) => {
//   const s = getSession(req);
//   if (!s) return res.status(401).json({ ok: false });
//   res.json({ ok: true, name: s.name, phone: s.phone, email: s.email });
// });
 
// // تعديل الملف الشخصي (الاسم و رقم الهاتف). الإيميل ما يتبدلش لأنو هو اللي تحققنا منو.
// app.put('/api/profile', (req, res) => {
//   const s = getSession(req);
//   if (!s) return res.status(401).json({ ok: false, error: 'سجل دخولك من جديد.' });
 
//   const name = cleanName(req.body.name);
//   const phone = normalizePhone(req.body.phone);
//   if (!name) return res.status(400).json({ ok: false, field: 'name', error: 'الاسم لازم يكون حرفين على الأقل (حروف فقط).' });
//   if (!phone) return res.status(400).json({ ok: false, field: 'phone', error: 'رقم الهاتف غير صحيح. مثال: 0555123456' });
 
//   saveUser(s.email, name, phone);
//   const token = sign({ name, phone, email: s.email, exp: s.exp });
//   res.cookie('session', token, {
//     httpOnly: true,
//     sameSite: 'lax',
//     secure: process.env.NODE_ENV === 'production',
//     maxAge: Math.max(s.exp - Date.now(), 1000),
//   });
//   res.json({ ok: true, name, phone, email: s.email });
// });
 
// app.post('/api/logout', (req, res) => {
//   res.clearCookie('session');
//   res.json({ ok: true });
// });
 
// // ---------- Pages ----------
// app.get('/welcome', (req, res) => {
//   if (!getSession(req)) return res.redirect('/');
//   res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
// });
 
// app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
 
// app.listen(PORT, () => {
//   console.log(`✅ السيرفر خدام على http://localhost:${PORT}`);
// });
 

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sendSms } = require('./sms');

const app = express();
app.set('trust proxy', 1); // مهم على Render (وراء proxy)
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET غير موجود في .env — راح يتبدل كل مرة تعاود تشغل السيرفر.');
}

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_S = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 3; // لكل رقم (يحمي الرصيد تاعك)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// ---------- Helpers ----------
const PHONE_RE = /^(?:\+213|00213|0)([567])\d{8}$/;

// يرجع الرقم بصيغة +213555123456 ولا null إذا غير صحيح
function normalizePhone(input) {
  const cleaned = String(input || '').replace(/[\s.\-()]/g, '');
  if (!PHONE_RE.test(cleaned)) return null;
  return '+213' + cleaned.replace(/^(?:\+213|00213|0)/, '');
}

function cleanName(input) {
  const name = String(input || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 50) return null;
  if (!/^[\p{L}\s'’-]+$/u.test(name)) return null;
  return name;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSession(req) {
  return verifyToken(req.cookies.session);
}

function setSessionCookie(res, token, maxAge) {
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  });
}

// ---------- Users storage (JSON file) — المفتاح هو رقم الهاتف ----------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function saveUser(phone, name) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let users = {};
    if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
    users[phone] = { name, lastLogin: new Date().toISOString() };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('تعذر حفظ المستخدم:', e.message);
  }
}

// ---------- OTP store (in memory) ----------
const otps = new Map();   // phone -> {code, name, expires, attempts, lastSent}
const sends = new Map();  // phone -> [timestamps] (آخر ساعة)

setInterval(() => {
  const now = Date.now();
  for (const [phone, rec] of otps) if (rec.expires < now) otps.delete(phone);
  for (const [phone, list] of sends) {
    const recent = list.filter((t) => now - t < 3600 * 1000);
    if (recent.length) sends.set(phone, recent); else sends.delete(phone);
  }
}, 60 * 1000).unref();

// ---------- Rate limiting ----------
const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10, // 10 طلبات إرسال في الساعة لكل IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'محاولات كثيرة، حاول مرة أخرى بعد قليل.' },
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'محاولات كثيرة، حاول مرة أخرى بعد قليل.' },
});

// ---------- API ----------
app.post('/api/send-otp', sendLimiter, async (req, res) => {
  const name = cleanName(req.body.name);
  const phone = normalizePhone(req.body.phone);
  if (!name) return res.status(400).json({ ok: false, field: 'name', error: 'الاسم لازم يكون حرفين على الأقل (حروف فقط).' });
  if (!phone) return res.status(400).json({ ok: false, field: 'phone', error: 'رقم الهاتف غير صحيح. مثال: 0555123456' });

  const now = Date.now();
  const existing = otps.get(phone);
  if (existing) {
    const wait = RESEND_COOLDOWN_S - Math.floor((now - existing.lastSent) / 1000);
    if (wait > 0) {
      return res.status(429).json({ ok: false, error: `انتظر ${wait} ثانية قبل إعادة الإرسال.`, retryAfter: wait });
    }
  }

  const recent = (sends.get(phone) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    return res.status(429).json({ ok: false, error: 'وصلت الحد الأقصى من الرسائل لهذا الرقم، حاول بعد ساعة.' });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  otps.set(phone, { code, name, expires: now + OTP_TTL_MS, attempts: 0, lastSent: now });

  try {
await sendSms(phone, `Lz-${code}\nis your verification code.`); 
    recent.push(now);
    sends.set(phone, recent);
  } catch (e) {
    console.error('SMS error:', e.message);
    otps.delete(phone);
    return res.status(502).json({ ok: false, error: 'تعذر إرسال الرسالة، حاول لاحقا.' });
  }

  // لا نرسل الرمز للمتصفح أبدا
  res.json({ ok: true, phone, cooldown: RESEND_COOLDOWN_S });
});

app.post('/api/verify-otp', verifyLimiter, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone) return res.status(400).json({ ok: false, error: 'رقم الهاتف غير صحيح.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok: false, error: 'الرمز لازم يكون 6 أرقام.' });

  const rec = otps.get(phone);
  if (!rec) return res.status(400).json({ ok: false, error: 'ما كاش رمز نشط. اطلب رمز جديد.' });
  if (rec.expires < Date.now()) {
    otps.delete(phone);
    return res.status(400).json({ ok: false, error: 'انتهت صلاحية الرمز. اطلب رمز جديد.' });
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    otps.delete(phone);
    return res.status(429).json({ ok: false, error: 'تجاوزت عدد المحاولات. اطلب رمز جديد.' });
  }

  const a = Buffer.from(code);
  const b = Buffer.from(rec.code);
  if (!crypto.timingSafeEqual(a, b)) {
    rec.attempts += 1;
    const left = MAX_ATTEMPTS - rec.attempts;
    return res.status(400).json({ ok: false, error: `الرمز غير صحيح. بقاولك ${left} محاولات.` });
  }

  otps.delete(phone);
  saveUser(phone, rec.name);
  const token = sign({ name: rec.name, phone, exp: Date.now() + SESSION_TTL_MS });
  setSessionCookie(res, token, SESSION_TTL_MS);
  res.json({ ok: true, redirect: '/welcome' });
});

app.get('/api/me', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false });
  res.json({ ok: true, name: s.name, phone: s.phone });
});

// تعديل الملف الشخصي (الاسم فقط). الرقم ما يتبدلش لأنو هو اللي تحققنا منو.
app.put('/api/profile', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false, error: 'سجل دخولك من جديد.' });

  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ ok: false, field: 'name', error: 'الاسم لازم يكون حرفين على الأقل (حروف فقط).' });

  saveUser(s.phone, name);
  const token = sign({ name, phone: s.phone, exp: s.exp });
  setSessionCookie(res, token, Math.max(s.exp - Date.now(), 1000));
  res.json({ ok: true, name, phone: s.phone });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// ---------- Pages ----------
app.get('/welcome', (req, res) => {
  if (!getSession(req)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ السيرفر خدام على http://localhost:${PORT}`);
});