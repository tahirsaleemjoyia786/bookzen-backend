// BookZen WhatsApp Cloud API helper (Phase 4) — zero dependencies,
// uses Node's built-in https module. No keys in this file: the token
// and phone number id come from environment variables set in Railway:
//   WHATSAPP_TOKEN            (permanent System User token, secret)
//   WHATSAPP_PHONE_NUMBER_ID  (test number id, e.g. 1362775043595891)
// Without them, sending is skipped (logged) so the booking logic can
// still be tested end to end — the booking is always recorded first.

const https = require('https');
const { tryBook, fmtMin } = require('./booking');

// Meta retries deliveries, so the same message id can arrive twice.
// Remember processed ids (in memory) and skip repeats.
const seenMessageIds = new Set();

function replyTextFor(result) {
  if (result.ok) {
    const a = result.appointment;
    return `Booked! ${a.serviceName} with ${a.staffName} on ${a.date} at ${fmtMin(a.startMin)}. (DEMO booking)`;
  }
  if (result.suggestion) return `${result.error} ${result.suggestion}`;
  return result.error;
}

function sendWhatsAppText(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.log('[whatsapp] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set — reply not sent (booking still recorded).');
    return Promise.resolve(false);
  }
  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'graph.facebook.com',
        path: `/v25.0/${phoneNumberId}/messages`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            console.log(`[whatsapp] Graph API error ${res.statusCode}: ${data}`);
            resolve(false);
          }
        });
      }
    );
    req.on('error', (e) => {
      console.log(`[whatsapp] send failed: ${e.message}`);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

// Handle one Meta webhook payload (POST /webhook, object =
// 'whatsapp_business_account'). Answers every incoming TEXT message
// with the same booking logic as the simulated webhook, against the
// demo business. Always resolves — the route must answer Meta 200
// even when a single message fails, or Meta keeps retrying.
async function handleMetaWebhook(store, body) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};
      // Status updates (sent/delivered/read) carry no messages.
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const nameByWaId = {};
      for (const c of contacts) {
        if (c.wa_id && c.profile && c.profile.name) nameByWaId[c.wa_id] = c.profile.name;
      }
      for (const msg of messages) {
        try {
          if (msg.id && seenMessageIds.has(msg.id)) continue;
          if (msg.id) seenMessageIds.add(msg.id);
          if (msg.type !== 'text' || !msg.text || !msg.text.body) continue;
          const customerPhone = msg.from;
          const customerName = nameByWaId[msg.from] || undefined;
          const text = msg.text.body;
          const businessId = 'biz_demo_barbershop';
          const chat = await store.getOrCreateChat({ businessId, customerPhone, customerName });
          await store.addMessage(chat, { from: 'customer', text });
          const result = await tryBook(store, { businessId, customerPhone, customerName, text });
          const reply = replyTextFor(result);
          await store.addMessage(chat, { from: 'bot', text: reply });
          await sendWhatsAppText(customerPhone, reply);
        } catch (e) {
          console.log(`[whatsapp] message handling failed: ${e && e.message ? e.message : e}`);
        }
      }
    }
  }
}

module.exports = { handleMetaWebhook, sendWhatsAppText };
