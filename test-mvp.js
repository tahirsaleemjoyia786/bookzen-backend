// BookZen MVP test — runs the real HTTP server on a random local port
// and exercises it with fetch. No network, no real WhatsApp, no paid service.
// Run: node test-mvp.js   (from backend/)
// Exit code 0 = all cases passed, 1 = at least one case failed.

const { createServer } = require('./server');
const { fmtMin } = require('./booking');

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`);
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function get(base, path) {
  return (await fetch(`${base}${path}`)).json();
}

async function main() {
  const { server, store } = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  console.log(`BookZen MVP test server: ${base}\n`);

  const demoBiz = 'biz_demo_barbershop';

  // Case 1: Customer books in English. 11am is inside working hours on
  // every day of the week (Mon-Fri 09-19, Sat 09-18, Sun 10-16), so this
  // test is not day-dependent.
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

  // Case 2: Same time, same service — but a second staff member is free,
  // so this is allowed by design. The TRUE double-booking test is Case 3,
  // where both staff are busy. Record Case 2 honestly as a second booking.
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

  // Case 3: Third booking, same time, same service — both staff are now busy,
  // so this MUST be rejected as DOUBLE_BOOKED.
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

  // Case 4: Roman Urdu booking ("beard trim kal 12 baje" = tomorrow, 12pm).
  // "kal" here means tomorrow. 12:00 is inside working hours every day
  // and both staff are free then, so this case is independent of Cases 1-3.
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

  // Case 5: New business signup starts as PENDING.
  const signup = await post(base, '/signup', {
    name: 'Demo New Barbershop',
    type: 'barbershop',
    ownerName: 'Demo New Owner',
    ownerPhone: '+920000000200',
  });
  check(
    '5. New business signup starts as PENDING',
    signup.ok === true && signup.business.status === 'PENDING',
    `status=${signup.business && signup.business.status}`
  );

  // Case 6: A PENDING business cannot take bookings yet.
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

  // Case 7: Super Admin approves the new business.
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

  // Case 8: A non-admin cannot approve (security check).
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

  // Case 9: Owner views bookings for the demo barbershop.
  const ownerView = await get(base, `/bookings?businessId=${demoBiz}`);
  const ownerAppts = await store.getAppointmentsForUser('user_demo_owner');
  check(
    '9. Owner viewing bookings (demo barbershop)',
    ownerView.ok === true && ownerView.count >= 3 && ownerAppts.length === ownerView.count,
    `count=${ownerView.count}, first=${ownerView.bookings[0] ? `${ownerView.bookings[0].serviceName} ${ownerView.bookings[0].date} ${ownerView.bookings[0].startTime}` : 'none'}`
  );

  // Case 10: Super Admin sees all businesses, including the new one.
  const bizList = await get(base, '/businesses');
  check(
    '10. Super Admin business list includes demo + newly approved business',
    bizList.ok === true && bizList.businesses.length >= 2,
    `count=${bizList.businesses.length}`
  );

  // Case 11: Services are configurable per business — a different business
  // type can add its own services later without changing the barbershop demo.
  // Here the newly approved business adds a salon-style demo service.
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

  console.log('\n--- Summary ---');
  const passed = results.filter((r) => r.passed).length;
  console.log(`${passed}/${results.length} cases passed.`);
  // Show the demo barbershop's final bookings for the record.
  const final = await get(base, `/bookings?businessId=${demoBiz}`);
  for (const b of final.bookings) {
    console.log(`  * ${b.serviceName} — ${b.date} ${b.startTime}-${b.endTime} — ${b.staffName} — ${b.customerName}`);
  }

  server.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
