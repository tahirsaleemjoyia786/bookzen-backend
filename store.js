// BookZen MVP — in-memory demo store only.
// No real business data, no real WhatsApp keys, no database, no paid service.
// All data is reset every time the server restarts. DEMO ONLY.

function createStore() {
  const users = [];
  const businesses = [];
  const services = [];
  const staff = [];
  const appointments = [];
  const chats = []; // { id, businessId, customerPhone, customerName, messages: [] }
  let seq = 1;
  const id = (prefix) => `${prefix}_${seq++}`;

  // --- Seed: one Super Admin (demo login, NOT a real account) ---
  users.push({
    id: 'user_admin',
    name: 'Demo Super Admin',
    role: 'SUPER_ADMIN', // SUPER_ADMIN | BUSINESS_OWNER | STAFF
    phone: '+920000000000', // demo placeholder, not a real number
    businessId: null,
  });

  // --- Seed: one DEMO barbershop, already Active, so the booking test has data ---
  // Primary MVP demo = men's barbershop (haircuts, fades, beard trims).
  // Services are configurable per business (see addService below), so a
  // salon, clinic or gym can be added later with completely different services.
  const demoBusiness = {
    id: 'biz_demo_barbershop',
    name: 'Demo Barbershop (DEMO ONLY — not a real business)',
    type: 'barbershop',
    status: 'ACTIVE', // PENDING | ACTIVE | PAUSED | BLOCKED
    plan: 'DEMO',
    ownerName: 'Demo Owner',
    ownerPhone: '+920000000001', // demo placeholder
    workingHours: {
      // 24h clock, local demo hours. Mon=1 ... Sun=0 in JS getDay() terms handled in booking.js.
      monday:    { open: '09:00', close: '19:00' },
      tuesday:   { open: '09:00', close: '19:00' },
      wednesday: { open: '09:00', close: '19:00' },
      thursday:  { open: '09:00', close: '19:00' },
      friday:    { open: '09:00', close: '19:00' },
      saturday:  { open: '09:00', close: '18:00' },
      sunday:    { open: '10:00', close: '16:00' },
    },
  };
  businesses.push(demoBusiness);

  users.push({
    id: 'user_demo_owner',
    name: 'Demo Owner',
    role: 'BUSINESS_OWNER',
    phone: '+920000000001',
    businessId: demoBusiness.id,
  });

  // DEMO barbershop services. Prices are invented DEMO values only —
  // not a real shop's menu. These are men's haircut / fade / beard services
  // because the first demo is a barbershop; other business types use
  // different service rows (see addService).
  const demoServices = [
    { name: 'Demo Haircut', durationMin: 30, priceLabel: 'DEMO PRICE' },
    { name: 'Demo Beard Trim', durationMin: 20, priceLabel: 'DEMO PRICE' },
    { name: 'Demo Skin Fade', durationMin: 40, priceLabel: 'DEMO PRICE' },
  ];
  for (const s of demoServices) {
    services.push({ id: id('svc'), businessId: demoBusiness.id, ...s });
  }

  // DEMO staff. Names are placeholders, not real employees of any business.
  const demoStaff = [{ name: 'Demo Barber A' }, { name: 'Demo Barber B' }];
  for (const s of demoStaff) {
    staff.push({ id: id('staff'), businessId: demoBusiness.id, ...s });
    users.push({
      id: id('user_staff'),
      name: s.name,
      role: 'STAFF',
      phone: '+920000000002',
      businessId: demoBusiness.id,
      staffId: staff[staff.length - 1].id,
    });
  }

  return {
    users, businesses, services, staff, appointments, chats,
    nextId: id,
    // List helpers (same shape as the Postgres store's): server.js uses
    // these so it does not read the raw arrays directly.
    async listBusinesses() { return businesses; },
    async listChats(businessId) {
      return chats.filter((c) => !businessId || c.businessId === businessId);
    },

    // --- Business signup + Super Admin approval flow ---
    // A new business ALWAYS starts as PENDING. It cannot take bookings
    // until a Super Admin sets it to ACTIVE.
    // NOTE (Phase 1): all store methods are async, matching the Postgres
    // store in db/pg_store.js. Values returned are identical to before.
    async signupBusiness({ name, type, ownerName, ownerPhone }) {
      const biz = {
        id: id('biz'),
        name,
        type: type || 'barbershop',
        status: 'PENDING',
        plan: null,
        ownerName,
        ownerPhone,
        workingHours: demoBusiness.workingHours,
      };
      businesses.push(biz);
      const owner = {
        id: id('user'),
        name: ownerName,
        role: 'BUSINESS_OWNER',
        phone: ownerPhone,
        businessId: biz.id,
      };
      users.push(owner);
      return { business: biz, owner };
    },

    async approveBusiness({ adminUserId, businessId, plan }) {
      const admin = users.find((u) => u.id === adminUserId);
      if (!admin || admin.role !== 'SUPER_ADMIN') {
        return { ok: false, error: 'Only a Super Admin can approve a business.' };
      }
      const biz = businesses.find((b) => b.id === businessId);
      if (!biz) return { ok: false, error: 'Business not found.' };
      if (biz.status !== 'PENDING') {
        return { ok: false, error: `Business is already ${biz.status}, not PENDING.` };
      }
      biz.status = 'ACTIVE';
      biz.plan = plan || 'DEMO';
      return { ok: true, business: biz };
    },

    async setBusinessStatus({ adminUserId, businessId, status }) {
      const admin = users.find((u) => u.id === adminUserId);
      if (!admin || admin.role !== 'SUPER_ADMIN') {
        return { ok: false, error: 'Only a Super Admin can change business status.' };
      }
      const biz = businesses.find((b) => b.id === businessId);
      if (!biz) return { ok: false, error: 'Business not found.' };
      biz.status = status;
      return { ok: true, business: biz };
    },

    async getBusiness(id) { return businesses.find((b) => b.id === id) || null; },
    async getServices(businessId) { return services.filter((s) => s.businessId === businessId); },
    // Services are configurable per business: any business can add its own
    // service rows. Example: a salon added later could add a facial or
    // manicure here, without changing the barbershop demo's services.
    async addService({ businessId, name, durationMin }) {
      if (!businessId || !name || !durationMin) return null;
      const svc = { id: id('svc'), businessId, name, durationMin, priceLabel: 'DEMO PRICE' };
      services.push(svc);
      return svc;
    },
    async getStaff(businessId) { return staff.filter((s) => s.businessId === businessId); },
    async getAppointments(businessId) {
      return appointments.filter((a) => a.businessId === businessId);
    },

    // Owner view: an owner only sees their own business's appointments.
    // Staff view is narrowed further by the caller (see server.js).
    async getAppointmentsForUser(userId) {
      const user = users.find((u) => u.id === userId);
      if (!user) return [];
      if (user.role === 'SUPER_ADMIN') return appointments;
      if (user.role === 'BUSINESS_OWNER' || user.role === 'STAFF') {
        return appointments.filter((a) => a.businessId === user.businessId);
      }
      return [];
    },

    async addAppointment(appt) {
      const row = { id: id('appt'), status: 'CONFIRMED', createdAt: new Date().toISOString(), ...appt };
      appointments.push(row);
      return row;
    },

    async getOrCreateChat({ businessId, customerPhone, customerName }) {
      let chat = chats.find(
        (c) => c.businessId === businessId && c.customerPhone === customerPhone
      );
      if (!chat) {
        chat = {
          id: id('chat'),
          businessId,
          customerPhone,
          customerName: customerName || 'Demo Customer',
          messages: [],
        };
        chats.push(chat);
      }
      return chat;
    },

    async addMessage(chat, { from, text }) {
      const msg = { id: id('msg'), from, text, at: new Date().toISOString() };
      chat.messages.push(msg);
      return msg;
    },
  };
}

module.exports = { createStore };
