// BookZen MVP backend — plain Node.js http, zero dependencies (except
// `pg`, only used when DATABASE_URL is set — see Phase 1).
// Run:  node server.js            (listens on PORT env var, default 3000)
// Test: node test-mvp.js          (starts this server on a random port)
// Database: by default the in-memory store (data resets on restart).
// Set DATABASE_URL to use the Postgres store instead (db/schema.sql must
// have been applied first — see SUPABASE-GUIDE.md).
// No real WhatsApp, no keys, no paid services. The /webhook endpoint is a
// SIMULATION: it pretends a WhatsApp message arrived and runs the same
// booking logic a real webhook would run later.

const http = require('http');
const { createStore } = require('./store');
const { tryBook, fmtMin } = require('./booking');
const { verifyIdToken } = require('./firebase_auth');
const { handleMetaWebhook } = require('./whatsapp');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function createServer(store) {
  // Phase 1: if no store is passed and DATABASE_URL is set, use the
  // Postgres store; otherwise use the in-memory store (default, and
  // what the tests use). The pg store initialises lazily (see its
  // `ready` promise) — every handler awaits it before touching data.
  if (!store) {
    if (process.env.DATABASE_URL) {
      const { createPgStore } = require('./db/pg_store');
      store = createPgStore();
    } else {
      store = createStore();
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (store.ready) await store.ready;
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;

      if (req.method === 'GET' && path === '/health') {
        return sendJson(res, 200, { ok: true, app: 'BookZen MVP (DEMO)', demoOnly: true });
      }// --- Privacy Policy page (Phase 4: Meta needs a Privacy Policy
// URL to switch the BarberZen app from Development to Live) ---
// GET /privacy -> plain HTML page. This page itself collects nothing.
if (req.method === 'GET' && path === '/privacy') {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BookZen — Privacy Policy</title>
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1{font-size:24px}h2{font-size:18px;margin-top:28px}</style>
</head><body>
<h1>BookZen — Privacy Policy</h1>
<p><em>Last updated: 19 November 2026. BookZen is currently a demo / MVP.</em></p>
<h2>What BookZen does</h2>
<p>BookZen helps barbershops, salons and similar businesses take bookings
and answer customers over WhatsApp. Customers message the business's
WhatsApp number; BookZen records the booking and shows it to the business
owner and staff in the BookZen app.</p>
<h2>Data we collect</h2>
<ul>
<li>Business details: business name and type, owner name and phone number.</li>
<li>Staff details: staff names and phone numbers added by the business owner.</li>
<li>Bookings: service, staff member, date and time chosen by the customer.</li>
<li>Messages: the WhatsApp messages a customer sends to the business to make
or change a booking, and the replies sent back.</li>
<li>Phone verification: phone numbers verified by one-time code (OTP) when
an owner or staff member signs in.</li>
</ul>
<h2>How we use it</h2>
<p>Only to take and manage bookings, show them to the business owner and
staff, and reply to customers in chat. We do not sell personal data and we
do not use it for advertising.</p>
<h2>Third parties</h2>
<ul>
<li>Meta WhatsApp Cloud API — delivers the WhatsApp messages.</li>
<li>Supabase (Postgres database) — stores businesses, services, staff and bookings.</li>
<li>Firebase Authentication — verifies phone numbers by OTP at sign-in.</li>
</ul>
<p>Data is shared with these providers only as needed to run the service.</p>
<h2>Keeping and deleting data</h2>
<p>Booking data is kept while the business account is active. A customer can
ask the business they booked with to delete their booking details; a business
owner can ask the BookZen admin (through the app) to delete their business
account and its data.</p>
<h2>Children</h2>
<p>BookZen is a tool for businesses and is not directed at children under 13.
We do not knowingly collect data from children.</p>
<h2>Changes to this policy</h2>
<p>If this policy changes, the new version will be posted on this page with a
new “last updated” date.</p>
</body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(html);
}

      // --- Meta webhook verification (Phase 4) ---
// Meta calls GET /webhook?hub.mode=subscribe&hub.verify_token=...
// &hub.challenge=... when the webhook is saved in the app
// dashboard. Answer with the challenge only when the verify
// token matches WEBHOOK_VERIFY_TOKEN (set in Railway).
if (req.method === 'GET' && path === '/webhook') {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && challenge && expected && token === expected) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(challenge);
  }
  return sendJson(res, 403, { ok: false, error: 'Webhook verification failed.' });
}

// --- Simulated WhatsApp webhook ---
      // POST /webhook  { businessId, customerPhone, customerName, text }
      // Simulates: customer sends a WhatsApp message -> bot replies -> booking.
      if (req.method === 'POST' && path === '/webhook') {
        const body = await readBody(req);
// Real Meta format? -> handle with the WhatsApp helper and
// always answer 200 (Meta retries anything else).
if (body && body.object === 'whatsapp_business_account') {
  await handleMetaWebhook(store, body);
  return sendJson(res, 200, { ok: true });
}

        const { businessId, customerPhone, customerName, text } = body;
        if (!businessId || !customerPhone || !text) {
          return sendJson(res, 400, { ok: false, error: 'businessId, customerPhone and text are required.' });
        }
        const chat = await store.getOrCreateChat({ businessId, customerPhone, customerName });
        await store.addMessage(chat, { from: 'customer', text });
        const result = await tryBook(store, { businessId, customerPhone, customerName, text });
        let reply;
        if (result.ok) {
          const a = result.appointment;
          reply = `Booked! ${a.serviceName} with ${a.staffName} on ${a.date} at ${fmtMin(a.startMin)}. (DEMO booking)`;
        } else if (result.suggestion) {
          reply = `${result.error} ${result.suggestion}`;
        } else {
          reply = result.error;
        }
        await store.addMessage(chat, { from: 'bot', text: reply });
        return sendJson(res, 200, { ok: result.ok, reply, appointment: result.appointment || null, error: result.error || null });
      }

      // --- Business signup (always starts PENDING) ---
      // POST /signup { name, type, ownerName, ownerPhone }
      if (req.method === 'POST' && path === '/signup') {
        const body = await readBody(req);
        if (!body.name || !body.ownerName || !body.ownerPhone) {
          return sendJson(res, 400, { ok: false, error: 'name, ownerName and ownerPhone are required.' });
        }
        const { business, owner } = await store.signupBusiness(body);
        return sendJson(res, 201, { ok: true, business, owner });
      }

      // --- Super Admin approval ---
      // POST /admin/approve { adminUserId, businessId, plan }
      if (req.method === 'POST' && path === '/admin/approve') {
        const body = await readBody(req);
        return sendJson(res, 200, await store.approveBusiness(body));
      }

      // --- Super Admin pause/block ---
      // POST /admin/status { adminUserId, businessId, status }
      if (req.method === 'POST' && path === '/admin/status') {
        const body = await readBody(req);
        return sendJson(res, 200, await store.setBusinessStatus(body));
      }

      // --- List bookings for a business (demo owner view) ---
      // GET /bookings?businessId=... or ?userId=... (staff view: only
      // the staff member's own appointments, Phase 3 staff login)
      if (req.method === 'GET' && path === '/bookings') {
        const businessId = url.searchParams.get('businessId');
        const userId = url.searchParams.get('userId');
        if (!businessId && !userId) {
          return sendJson(res, 400, { ok: false, error: 'businessId or userId is required.' });
        }
        const raw = userId
          ? await store.getAppointmentsForUser(userId)
          : await store.getAppointments(businessId);
        const list = raw.map((a) => ({

          ...a,
          startTime: fmtMin(a.startMin),
          endTime: fmtMin(a.endMin),
        }));
        return sendJson(res, 200, { ok: true, count: list.length, bookings: list });
      }

      // --- List services / staff / chats (demo data for the Flutter screens) ---
      if (req.method === 'GET' && path === '/services') {
        const businessId = url.searchParams.get('businessId');
        return sendJson(res, 200, { ok: true, services: await store.getServices(businessId) });
      }
      // --- Add a service (proves services are configurable per business) ---
      // POST /services { businessId, name, durationMin }
      if (req.method === 'POST' && path === '/services') {
        const body = await readBody(req);
        const svc = await store.addService(body);
        if (!svc) return sendJson(res, 400, { ok: false, error: 'businessId, name and durationMin are required.' });
        return sendJson(res, 201, { ok: true, service: svc });
      }
      if (req.method === 'GET' && path === '/staff') {
        const businessId = url.searchParams.get('businessId');
        return sendJson(res, 200, { ok: true, staff: await store.getStaff(businessId) });
      }
      if (req.method === 'GET' && path === '/chats') {
        const businessId = url.searchParams.get('businessId');
        const list = await store.listChats(businessId);
        return sendJson(res, 200, { ok: true, chats: list });
      }
      if (req.method === 'GET' && path === '/businesses') {
        return sendJson(res, 200, { ok: true, businesses: await store.listBusinesses() });
      }


// --- Look up a user by verified phone (Phase 3 staff login) ---
// GET /me?phone=... -> { ok, user } or 404. The app calls this
// after /auth/verify so it knows the role (owner vs staff).
if (req.method === 'GET' && path === '/me') {
  const phone = url.searchParams.get('phone');
  if (!phone) return sendJson(res, 400, { ok: false, error: 'phone is required.' });
  const user = await store.getUserByPhone(phone);
  if (!user) return sendJson(res, 404, { ok: false, error: 'No account for this phone.' });
  return sendJson(res, 200, {
    ok: true,
    user: { id: user.id, name: user.name, role: user.role, businessId: user.businessId || null, staffId: user.staffId || null },
  });
}
// --- Verify a Firebase OTP login (Phase 3 Stage B) ---
// POST /auth/verify { idToken } -> { ok, uid, phone }
// The app calls this right after OTP so the SERVER, not just
// the app, confirms the phone number is real.
if (req.method === 'POST' && path === '/auth/verify') {
  const body = await readBody(req);
  if (!body.idToken) {
    return sendJson(res, 400, { ok: false, error: 'idToken is required.' });
  }
  try {
    const { uid, phone } = await verifyIdToken(body.idToken);
    return sendJson(res, 200, { ok: true, uid, phone });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') {
      return sendJson(res, 503, { ok: false, error: 'OTP verification is not configured on the server yet (FIREBASE_SERVICE_ACCOUNT missing).' });
    }
    return sendJson(res, 401, { ok: false, error: 'Invalid or expired token.' });
  }
}

return sendJson(res, 404, { ok: false, error: 'Not found. See README.md for endpoints.' });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    }
  });
  return { server, store };
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const { server } = createServer();
  server.listen(port, () => {
    console.log(`BookZen MVP backend (DEMO) listening on http://localhost:${port}`);
    console.log(process.env.DATABASE_URL ? 'Store: Postgres (DATABASE_URL set)' : 'Store: in-memory (data resets on restart — see SUPABASE-GUIDE.md for the real database)');
console.log('Endpoints: GET /health, GET /webhook (Meta verify), POST /webhook, POST /signup, POST /admin/approve, GET /bookings, POST /auth/verify, GET /me');


  });
}

module.exports = { createServer };
