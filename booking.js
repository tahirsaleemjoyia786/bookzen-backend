// BookZen MVP — simple booking-intent parser + slot checker.
// This is a DEMO parser, not a real AI model. It only understands a small set
// of English and Roman Urdu phrases, on purpose, so the MVP stays testable.
// Examples it understands:
//   "haircut tomorrow 5pm"
//   "book a beard trim kal 5 baje"
//   "skin fade tomorrow 17:00"
//   "haircut 2026-11-02 5pm"

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toMin(h, m) { return h * 60 + m; }
function parseClock(str) {
  // "09:00" -> minutes since midnight
  const [h, m] = str.split(':').map(Number);
  return toMin(h, m || 0);
}

function resolveDate(text, today) {
  const t = text.toLowerCase();
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  if (/\btoday\b|\baaj\b/.test(t)) return d;
  if (/\btomorrow\b|\bkal\b/.test(t)) { d.setDate(d.getDate() + 1); return d; }
  if (/\bparson\b|day after tomorrow/.test(t)) { d.setDate(d.getDate() + 2); return d; }
  const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return new Date(`${iso[1]}T00:00:00`);
  // Weekday name -> next occurrence of that weekday (never today, always future).
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (new RegExp(`\\b${DAY_NAMES[i]}\\b`).test(t)) {
      const delta = ((i - d.getDay()) + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      return d;
    }
  }
  return null;
}

function resolveTime(text) {
  // Remove an ISO date first, so "2026" is not mistaken for a time.
  const t = text.toLowerCase().replace(/\d{4}-\d{2}-\d{2}/g, '');
  // 17:00 or 5:30pm or 5pm or "5 baje"
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am|baje)?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3];
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  // Roman Urdu "5 baje" with no am/pm: barbershop demo hours are daytime/evening,
  // so 1-7 baje is treated as PM, 8-11 as AM. This assumption is documented
  // in the README and only applies to this demo parser.
  if (suffix === 'baje' && hour >= 1 && hour <= 7) hour += 12;
  return toMin(hour, min);
}

function matchService(text, services) {
  const t = text.toLowerCase();
  // Check the most specific service first (skin fade before generic cut).
  if (/skin\s*fade|fade/.test(t)) {
    return services.find((s) => /fade/i.test(s.name)) || null;
  }
  if (/beard|dari|daari/.test(t)) {
    return services.find((s) => /beard/i.test(s.name)) || null;
  }
  if (/haircut|hair\s*cut|cut|baal/.test(t)) {
    return services.find((s) => /haircut/i.test(s.name)) || null;
  }
  return null;
}

// Parse a customer message into a booking request. Returns
// { ok: true, service, dateStr, startMin, endMin } or { ok: false, error }.
function parseIntent(text, services, today = new Date()) {
  if (!text || typeof text !== 'string') return { ok: false, error: 'Empty message.' };
  const service = matchService(text, services);
  if (!service) {
    return {
      ok: false,
      error: 'Could not understand the service. Try: haircut, beard trim, or skin fade.',
    };
  }
  const date = resolveDate(text, today);
  if (!date) {
    return {
      ok: false,
      error: 'Could not understand the day. Try: today, tomorrow, kal, or a date like 2026-11-02.',
    };
  }
  const startMin = resolveTime(text);
  if (startMin === null) {
    return { ok: false, error: 'Could not understand the time. Try: 5pm, 17:00, or 5 baje.' };
  }
  return {
    ok: true,
    service,
    dateStr: toDateStr(date),
    dayName: DAY_NAMES[date.getDay()],
    startMin,
    endMin: startMin + service.durationMin,
  };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// Try to book. Returns { ok: true, appointment } or
// { ok: false, error, suggestion } where suggestion is a free time string.
// Async since Phase 1: the store (in-memory or Postgres) is async.
async function tryBook(store, { businessId, customerPhone, customerName, text }) {
  const business = await store.getBusiness(businessId);
  if (!business) return { ok: false, error: 'Business not found.' };
  if (business.status !== 'ACTIVE') {
    return { ok: false, error: `Business is ${business.status}, not ACTIVE. Booking blocked until Super Admin approval.` };
  }
  const services = await store.getServices(businessId);
  const parsed = parseIntent(text, services);
  if (!parsed.ok) return parsed;

  const hours = business.workingHours[parsed.dayName];
  if (!hours) return { ok: false, error: `No working hours for ${parsed.dayName}.` };
  const openMin = parseClock(hours.open);
  const closeMin = parseClock(hours.close);
  if (parsed.startMin < openMin || parsed.endMin > closeMin) {
    return {
      ok: false,
      error: `Outside working hours (${hours.open}-${hours.close} on ${parsed.dayName}).`,
    };
  }

  const staffList = await store.getStaff(businessId);
  const todays = (await store.getAppointments(businessId))
    .filter((a) => a.date === parsed.dateStr && a.status === 'CONFIRMED');

  // Pick the first staff member with no overlapping booking.
  let chosenStaff = null;
  for (const s of staffList) {
    const clash = todays.some(
      (a) => a.staffId === s.id && overlaps(parsed.startMin, parsed.endMin, a.startMin, a.endMin)
    );
    if (!clash) { chosenStaff = s; break; }
  }
  if (!chosenStaff) {
    // Suggest the next free hour on the same day, for any staff member.
    let suggestion = null;
    for (let t = parsed.startMin + 60; t + parsed.service.durationMin <= closeMin; t += 60) {
      const free = staffList.some((s) => !todays.some(
        (a) => a.staffId === s.id && overlaps(t, t + parsed.service.durationMin, a.startMin, a.endMin)
      ));
      if (free) { suggestion = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; break; }
    }
    return {
      ok: false,
      error: 'DOUBLE_BOOKED: all staff are busy at that time.',
      suggestion: suggestion ? `Try ${suggestion} on ${parsed.dateStr}.` : 'No free slot left that day.',
    };
  }

  const appointment = await store.addAppointment({
    businessId,
    serviceId: parsed.service.id,
    serviceName: parsed.service.name,
    staffId: chosenStaff.id,
    staffName: chosenStaff.name,
    customerPhone,
    customerName: customerName || 'Demo Customer',
    date: parsed.dateStr,
    startMin: parsed.startMin,
    endMin: parsed.endMin,
    source: 'simulated-whatsapp',
  });
  return { ok: true, appointment };
}

function fmtMin(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }

module.exports = { parseIntent, tryBook, fmtMin, toDateStr };
