// sms.js — يدعم 3 أوضاع حسب ما هو موجود في .env:
// 1) SMS Gateway (تلفون Android):  SMS_GATE_USER + SMS_GATE_PASS
// 2) Infobip:                       INFOBIP_API_KEY + INFOBIP_BASE_URL
// 3) وضع التجريب: الرمز يطلع في الـ terminal

function digits(phone) {
  let p = String(phone).replace(/[\s.\-()]/g, '');
  if (p.startsWith('00213')) p = '213' + p.slice(5);
  else if (p.startsWith('+213')) p = p.slice(1);
  else if (p.startsWith('0')) p = '213' + p.slice(1);
  return p; // 213555123456
}
function toInternational(phone) { return '+' + digits(phone); }

async function viaSmsGate(to, text) {
  const url = process.env.SMS_GATE_URL || 'https://api.sms-gate.app/3rdparty/v1/messages';
  const auth = Buffer.from(process.env.SMS_GATE_USER + ':' + process.env.SMS_GATE_PASS).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + auth },
    body: JSON.stringify({ textMessage: { text }, phoneNumbers: ['+' + to] }),
  });
  if (!res.ok) throw new Error('SMSGate failed: ' + res.status + ' ' + (await res.text().catch(() => '')));
}

async function viaInfobip(to, text) {
  const base = process.env.INFOBIP_BASE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const res = await fetch(`https://${base}/sms/3/messages`, {
    method: 'POST',
    headers: {
      Authorization: 'App ' + process.env.INFOBIP_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      messages: [{
        sender: process.env.INFOBIP_SENDER || 'ServiceSMS',
        destinations: [{ to }],
        content: { text },
      }],
    }),
  });
  if (!res.ok) throw new Error('Infobip failed: ' + res.status + ' ' + (await res.text().catch(() => '')));
}

async function sendSms(phone, text) {
  const to = digits(phone);

  if (process.env.SMS_GATE_USER && process.env.SMS_GATE_PASS) {
    await viaSmsGate(to, text);
  } else if (process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL) {
    await viaInfobip(to, text);
  } else {
    console.log('\n==============================');
    console.log('📱 (وضع التجريب) SMS إلى +' + to);
    console.log(text);
    console.log('==============================\n');
  }
  return true;
}

module.exports = { sendSms, toInternational };