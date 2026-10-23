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
const PORT = process.env.PORT || 3001;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET is missing in .env — it will change every time the server restarts.');
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
    console.error('Could not save user:', e.message);
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
  message: { ok: false, error: 'Too many attempts. Please try again shortly.' },
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please try again shortly.' },
});

// ---------- API ----------
app.post('/api/send-otp', sendLimiter, async (req, res) => {
  const name = cleanName(req.body.name);
  const phone = normalizePhone(req.body.phone);
  if (!name) return res.status(400).json({ ok: false, field: 'name', error: 'Name must be at least 2 letters (letters only).' });
  if (!phone) return res.status(400).json({ ok: false, field: 'phone', error: 'Invalid phone number. Example: 0555123456' });

  const now = Date.now();
  const existing = otps.get(phone);
  if (existing) {
    const wait = RESEND_COOLDOWN_S - Math.floor((now - existing.lastSent) / 1000);
    if (wait > 0) {
      return res.status(429).json({ ok: false, error: `Please wait ${wait} seconds before resending.`, retryAfter: wait });
    }
  }

  const recent = (sends.get(phone) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    return res.status(429).json({ ok: false, error: 'Maximum messages reached for this number. Try again in an hour.' });
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
    return res.status(502).json({ ok: false, error: 'Could not send the message. Please try later.' });
  }

  // لا نرسل الرمز للمتصفح أبدا
  res.json({ ok: true, phone, cooldown: RESEND_COOLDOWN_S });
});

app.post('/api/verify-otp', verifyLimiter, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone) return res.status(400).json({ ok: false, error: 'Invalid phone number.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok: false, error: 'The code must be 6 digits.' });

  const rec = otps.get(phone);
  if (!rec) return res.status(400).json({ ok: false, error: 'No active code. Request a new one.' });
  if (rec.expires < Date.now()) {
    otps.delete(phone);
    return res.status(400).json({ ok: false, error: 'The code has expired. Request a new one.' });
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    otps.delete(phone);
    return res.status(429).json({ ok: false, error: 'Too many attempts. Request a new code.' });
  }

  const a = Buffer.from(code);
  const b = Buffer.from(rec.code);
  if (!crypto.timingSafeEqual(a, b)) {
    rec.attempts += 1;
    const left = MAX_ATTEMPTS - rec.attempts;
    return res.status(400).json({ ok: false, error: `Incorrect code. ${left} attempts left.` });
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
  if (!s) return res.status(401).json({ ok: false, error: 'Please sign in again.' });

  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ ok: false, field: 'name', error: 'Name must be at least 2 letters (letters only).' });

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
// الحماية دابا من Firebase داخل welcome.html (إذا ما كانش مسجل دخول يرجعو للرئيسية)
app.get('/welcome', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});