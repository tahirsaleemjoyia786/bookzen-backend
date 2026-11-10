// BookZen Phase 1 test — SAME 11 cases as test-mvp.js, but against the
// Postgres store (db/pg_store.js) backed by pg-mem, an in-memory Postgres
// emulator. No live Supabase/Postgres server is needed or used.
// Run: node test-db.js   (from backend/)
// Exit code 0 = all cases passed, 1 = at least one case failed.
// A fresh pg-mem database is created on every run. After the 11 cases,
// a SECOND store object is created against the SAME pg-mem database
// (simulating a server restart) and must still see the approved
// business and its bookings — that is the persistence check.

const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');
const { createPgStore } = require('./db/pg_store');
const { createServer } = require('./server');

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`);
}

async function post(base, p, body) {
  const res = await fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function get(base, p) {
  return (await fetch(`${base}${p}`)).json();
}

async function main() {
  // Fresh in-memory Postgres, schema applied from db/schema.sql.
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  const store = createPgStore(pool);
  await store.ready;

  // Numbering check (separate fresh database): the FIRST signup after
  // the seed must get id biz_8, exactly like the in-memory store.
  // (In the main 11 cases the signup happens after 4 bookings, which
  // consume ids first — so there it is biz_23, same as in-memory.)
  const mem0 = newDb();
  const { Pool: Pool0 } = mem0.adapters.createPg();
  const pool0 = new Pool0();
  await pool0.query(schema);
  const store0 = createPgStore(pool0);
  await store0.ready;
  const firstSignup = await store0.signupBusiness({
    name: 'Numbering Check', ownerName: 'Check Owner', ownerPhone: '+920000000300',
  });
  check(
    '0. First signup after seed gets id biz_8',
    firstSignup.business.id === 'biz_8',
    `id=${firstSignup.business.id}`
  );
  await pool0.end();

  const { server } = createServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  console.log(`BookZen Phase 1 (Postgres/pg-mem) test server: ${base}\n`);

  const demoBiz = 'biz_demo_barbershop';

  const book1 = await post(base, '/webhook', {
    businessId: demoBiz,
    customerPhone: '+920000000100',
    customerName: 'Demo Customer 1',
    text: 'haircut tomorrow 11am',
  });
  check(
    '1. Customer booking (English: haircut tomorrow 11am)',
    book1.ok === true && !!book1.appointment,
    book1.reply || book1.error
  );

  const book2 = await post(base, '/webhook', {
    businessId: demoBiz,
    customerPhone: '+920000000101',
    customerName: 'Demo Customer 2',
    text: 'haircut tomorrow 11am',
  });
  check(
    '2. Second booking same time goes to the other free staff member',
    book2.ok === true && book2.appointment && book2.appointment.staffId !== book1.appointment.staffId,
    book2.reply || book2.error
  );

  const book3 = await post(base, '/webhook', {
    businessId: demoBiz,
    customerPhone: '+920000000102',
    customerName: 'Demo Customer 3',
    text: 'haircut tomorrow 11am',
  });
  check(
    '3. Double-booking attempt rejected (both staff busy at that time)',
    book3.ok === false && /DOUBLE_BOOKED/.test(book3.error || ''),
    book3.reply || book3.error
  );

  const book4 = await post(base, '/webhook', {
    businessId: demoBiz,
    customerPhone: '+920000000103',
    customerName: 'Demo Customer 4',
    text: 'beard trim kal 12 baje',
  });
  check(
    '4. Customer booking (Roman Urdu: beard trim kal 12 baje)',
    book4.ok === true && !!book4.appointment,
    book4.reply || book4.error
  );

  const signup = await post(base, '/signup', {
    name: 'Demo New Barbershop',
    type: 'barbershop',
    ownerName: 'Demo New Owner',
    ownerPhone: '+920000000200',
  });
  check(
    '5. New business signup starts as PENDING',
    signup.ok === true && signup.business.status === 'PENDING',
    `id=${signup.business && signup.business.id}, status=${signup.business && signup.business.status}`
  );

  const blocked = await post(base, '/webhook', {
    businessId: signup.business.id,
    customerPhone: '+920000000201',
    customerName: 'Demo Customer 5',
    text: 'haircut tomorrow 11am',
  });
  check(
    '6. PENDING business booking is blocked before approval',
    blocked.ok === false && /not ACTIVE/.test(blocked.error || ''),
    blocked.reply || blocked.error
  );

  const approved = await post(base, '/admin/approve', {
    adminUserId: 'user_admin',
    businessId: signup.business.id,
    plan: 'DEMO',
  });
  check(
    '7. Super Admin approval changes PENDING -> ACTIVE',
    approved.ok === true && approved.business.status === 'ACTIVE',
    `status=${approved.business && approved.business.status}`
  );

  const fakeApprove = await post(base, '/admin/approve', {
    adminUserId: 'user_demo_owner',
    businessId: signup.business.id,
    plan: 'DEMO',
  });
  check(
    '8. Non-admin approval is rejected',
    fakeApprove.ok === false,
    fakeApprove.error || ''
  );

  const ownerView = await get(base, `/bookings?businessId=${demoBiz}`);
  const ownerAppts = await store.getAppointmentsForUser('user_demo_owner');
  check(
    '9. Owner viewing bookings (demo barbershop)',
    ownerView.ok === true && ownerView.count >= 3 && ownerAppts.length === ownerView.count,
    `count=${ownerView.count}, first=${ownerView.bookings[0] ? `${ownerView.bookings[0].serviceName} ${ownerView.bookings[0].date} ${ownerView.bookings[0].startTime}` : 'none'}`
  );

  const bizList = await get(base, '/businesses');
  check(
    '10. Super Admin business list includes demo + newly approved business',
    bizList.ok === true && bizList.businesses.length >= 2,
    `count=${bizList.businesses.length}`
  );

  const newSvc = await post(base, '/services', {
    businessId: signup.business.id,
    name: 'Demo Salon Service (configurable example)',
    durationMin: 45,
  });
  const newBizServices = await get(base, `/services?businessId=${signup.business.id}`);
  const demoBizServices = await get(base, `/services?businessId=${demoBiz}`);
  check(
    '11. Services are configurable per business (salon service added to new business only)',
    newSvc.ok === true
      && newBizServices.services.some((s) => s.name === 'Demo Salon Service (configurable example)')
      && !demoBizServices.services.some((s) => s.name === 'Demo Salon Service (configurable example)')
      && demoBizServices.services.length === 3,
    `new business services=${newBizServices.services.length}, demo barbershop services=${demoBizServices.services.length}`
  );

  // --- Persistence check: a NEW store object against the SAME database
  // (simulating a server restart) must still see the approved business
  // and the bookings made above.
  const store2 = createPgStore(pool);
  await store2.ready;
  const bizAfterRestart = await store2.getBusiness(signup.business.id);
  const apptsAfterRestart = await store2.getAppointments(demoBiz);
  const chatsAfterRestart = await store2.listChats(demoBiz);
  check(
    '12. Persistence: approved business + bookings survive a store re-creation (simulated restart)',
    bizAfterRestart && bizAfterRestart.status === 'ACTIVE' && bizAfterRestart.plan === 'DEMO'
      && apptsAfterRestart.length >= 3
      && chatsAfterRestart.length >= 1,
    `business=${bizAfterRestart && bizAfterRestart.status}/${bizAfterRestart && bizAfterRestart.plan}, bookings=${apptsAfterRestart.length}, chats=${chatsAfterRestart.length}`
  );

  console.log('\n--- Summary ---');
  const passed = results.filter((r) => r.passed).length;
  console.log(`${passed}/${results.length} cases passed.`);

  server.close();
  await pool.end();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
