// BookZen Phase 1 — Postgres store (Supabase / PostgreSQL).
// Same interface and return shapes as store.js (in-memory), but every
// method is async and data lives in Postgres, so it survives a restart.
// Use: createPgStore(pool) or createPgStore() with DATABASE_URL set.
// Tables must already exist — apply db/schema.sql first (Supabase SQL
// Editor, or `node db/setup.js`). This file only SEEDS the demo data
// if the businesses table is empty; it never creates tables.
// No real credentials here: the connection comes from DATABASE_URL only.

const { Pool } = require('pg');

// Same demo working hours as store.js (24h clock, local demo hours).
const WORKING_HOURS = {
  monday: { open: '09:00', close: '19:00' },
  tuesday: { open: '09:00', close: '19:00' },
  wednesday: { open: '09:00', close: '19:00' },
  thursday: { open: '09:00', close: '19:00' },
  friday: { open: '09:00', close: '19:00' },
  saturday: { open: '09:00', close: '18:00' },
  sunday: { open: '10:00', close: '16:00' },
};

function parseJson(v) {
  if (v == null) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  return v;
}
function iso(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  return v;
}

function mapUser(r) {
  const u = { id: r.id, name: r.name, role: r.role, phone: r.phone, businessId: r.business_id };
  if (r.staff_id) u.staffId = r.staff_id;
  return u;
}
function mapBusiness(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    plan: r.plan,
    ownerName: r.owner_name,
    ownerPhone: r.owner_phone,
    workingHours: parseJson(r.working_hours) || {},
  };
}
function mapService(r) {
  return { id: r.id, businessId: r.business_id, name: r.name, durationMin: r.duration_min, priceLabel: r.price_label };
}
function mapStaff(r) {
  return { id: r.id, businessId: r.business_id, name: r.name };
}
function mapAppointment(r) {
  return {
    id: r.id,
    businessId: r.business_id,
    serviceId: r.service_id,
    serviceName: r.service_name,
    staffId: r.staff_id,
    staffName: r.staff_name,
    customerPhone: r.customer_phone,
    customerName: r.customer_name,
    date: r.date,
    startMin: r.start_min,
    endMin: r.end_min,
    status: r.status,
    source: r.source,
    createdAt: iso(r.created_at),
  };
}
function mapMessage(r) {
  return { id: r.id, from: r.sender, text: r.text, at: iso(r.at) };
}

function createPgStore(pool) {
  const db = pool || new Pool({ connectionString: process.env.DATABASE_URL });
  const ownsPool = !pool;

  // In-memory caches, loaded from Postgres once (see `ready` below).
  // The returned object's users/businesses/services/staff/appointments/
  // chats properties ARE these arrays, so server.js can read them the
  // same way it reads the in-memory store's arrays.
  const users = [];
  const businesses = [];
  const services = [];
  const staff = [];
  const appointments = [];
  const chats = []; // each chat: { id, businessId, customerPhone, customerName, messages: [] }
  let seq = 1;

  async function loadAll() {
    const [u, b, s, st, a, c, m] = await Promise.all([
      db.query('SELECT * FROM users ORDER BY id'),
      db.query('SELECT * FROM businesses ORDER BY id'),
      db.query('SELECT * FROM services ORDER BY id'),
      db.query('SELECT * FROM staff ORDER BY id'),
      db.query('SELECT * FROM appointments ORDER BY created_at, id'),
      db.query('SELECT * FROM chats ORDER BY id'),
      db.query('SELECT * FROM messages ORDER BY at, id'),
    ]);
    users.length = 0; users.push(...u.rows.map(mapUser));
    businesses.length = 0; businesses.push(...b.rows.map(mapBusiness));
    services.length = 0; services.push(...s.rows.map(mapService));
    staff.length = 0; staff.push(...st.rows.map(mapStaff));
    appointments.length = 0; appointments.push(...a.rows.map(mapAppointment));
    chats.length = 0;
    const byId = {};
    for (const row of c.rows) {
      const chat = { id: row.id, businessId: row.business_id, customerPhone: row.customer_phone, customerName: row.customer_name, messages: [] };
      chats.push(chat);
      byId[chat.id] = chat;
    }
    for (const row of m.rows) {
      if (byId[row.chat_id]) byId[row.chat_id].messages.push(mapMessage(row));
    }
  }

  // Seed exactly like store.js (same ids, same order), only if empty.
  // Order matters: svc_1..3, staff_4 + user_staff_5, staff_6 + user_staff_7,
  // so the next generated id is *_8.
  async function seedIfEmpty() {
    const count = await db.query('SELECT COUNT(*)::int AS n FROM businesses');
    if (count.rows[0].n > 0) return false;
    await db.query(
      "INSERT INTO users (id, name, role, phone, business_id) VALUES ('user_admin','Demo Super Admin','SUPER_ADMIN','+920000000000',NULL)"
    );
    await db.query(
      "INSERT INTO businesses (id, name, type, status, plan, owner_name, owner_phone, working_hours) VALUES ('biz_demo_barbershop','Demo Barbershop (DEMO ONLY — not a real business)','barbershop','ACTIVE','DEMO','Demo Owner','+920000000001',$1::jsonb)",
      [JSON.stringify(WORKING_HOURS)]
    );
    await db.query(
      "INSERT INTO users (id, name, role, phone, business_id) VALUES ('user_demo_owner','Demo Owner','BUSINESS_OWNER','+920000000001','biz_demo_barbershop')"
    );
    const demoServices = [
      { id: 'svc_1', name: 'Demo Haircut', durationMin: 30 },
      { id: 'svc_2', name: 'Demo Beard Trim', durationMin: 20 },
      { id: 'svc_3', name: 'Demo Skin Fade', durationMin: 40 },
    ];
    for (const s of demoServices) {
      await db.query(
        'INSERT INTO services (id, business_id, name, duration_min, price_label) VALUES ($1,$2,$3,$4,$5)',
        [s.id, 'biz_demo_barbershop', s.name, s.durationMin, 'DEMO PRICE']
      );
    }
    const demoStaff = [
      { staffId: 'staff_4', userId: 'user_staff_5', name: 'Demo Barber A' },
      { staffId: 'staff_6', userId: 'user_staff_7', name: 'Demo Barber B' },
    ];
    for (const s of demoStaff) {
      await db.query('INSERT INTO staff (id, business_id, name) VALUES ($1,$2,$3)', [s.staffId, 'biz_demo_barbershop', s.name]);
      await db.query(
        'INSERT INTO users (id, name, role, phone, business_id, staff_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [s.userId, s.name, 'STAFF', '+920000000002', 'biz_demo_barbershop', s.staffId]
      );
    }
    await db.query("INSERT INTO id_counters (prefix, next_val) VALUES ('seq', 8) ON CONFLICT (prefix) DO NOTHING");
    return true;
  }

  async function init() {
    await seedIfEmpty();
    const counter = await db.query("SELECT next_val FROM id_counters WHERE prefix = 'seq'");
    if (counter.rows.length) {
      seq = counter.rows[0].next_val;
    } else {
      // No counter row (e.g. schema applied without the seed): derive the
      // next id from the largest numeric suffix already in use, so new
      // ids never collide with existing rows.
      const tables = ['users', 'businesses', 'services', 'staff', 'appointments', 'chats', 'messages'];
      let max = 0;
      for (const t of tables) {
        const r = await db.query(`SELECT id FROM ${t}`);
        for (const row of r.rows) {
          const m = /_(\d+)$/.exec(row.id || '');
          if (m) max = Math.max(max, parseInt(m[1], 10));
        }
      }
      seq = max + 1;
      await db.query('INSERT INTO id_counters (prefix, next_val) VALUES ($1, $2) ON CONFLICT (prefix) DO UPDATE SET next_val = EXCLUDED.next_val', ['seq', seq]);
    }
    await loadAll();
  }

  const ready = init();

  async function nextId(prefix) {
    await ready;
    const n = seq;
    seq += 1;
    await db.query('UPDATE id_counters SET next_val = $1 WHERE prefix = $2', [seq, 'seq']);
    return `${prefix}_${n}`;
  }

  const store = {
    users, businesses, services, staff, appointments, chats,
    ready,
    pool: db,
    async close() {
      if (ownsPool) await db.end();
    },
    nextId: (prefix) => nextId(prefix),

    async listBusinesses() {
      await ready;
      return businesses;
    },
    async listChats(businessId) {
      await ready;
      return chats.filter((c) => !businessId || c.businessId === businessId);
    },

    async signupBusiness({ name, type, ownerName, ownerPhone }) {
      const biz = {
        id: await nextId('biz'),
        name,
        type: type || 'barbershop',
        status: 'PENDING',
        plan: null,
        ownerName,
        ownerPhone,
        workingHours: { ...WORKING_HOURS },
      };
      await db.query(
        'INSERT INTO businesses (id, name, type, status, plan, owner_name, owner_phone, working_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
        [biz.id, biz.name, biz.type, biz.status, biz.plan, biz.ownerName, biz.ownerPhone, JSON.stringify(biz.workingHours)]
      );
      businesses.push(biz);
      const owner = {
        id: await nextId('user'),
        name: ownerName,
        role: 'BUSINESS_OWNER',
        phone: ownerPhone,
        businessId: biz.id,
      };
      await db.query(
        'INSERT INTO users (id, name, role, phone, business_id) VALUES ($1,$2,$3,$4,$5)',
        [owner.id, owner.name, owner.role, owner.phone, owner.businessId]
      );
      users.push(owner);
      return { business: biz, owner };
    },

    async approveBusiness({ adminUserId, businessId, plan }) {
      await ready;
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
      await db.query('UPDATE businesses SET status = $1, plan = $2 WHERE id = $3', [biz.status, biz.plan, biz.id]);
      return { ok: true, business: biz };
    },

    async setBusinessStatus({ adminUserId, businessId, status }) {
      await ready;
      const admin = users.find((u) => u.id === adminUserId);
      if (!admin || admin.role !== 'SUPER_ADMIN') {
        return { ok: false, error: 'Only a Super Admin can change business status.' };
      }
      const biz = businesses.find((b) => b.id === businessId);
      if (!biz) return { ok: false, error: 'Business not found.' };
      biz.status = status;
      await db.query('UPDATE businesses SET status = $1 WHERE id = $2', [biz.status, biz.id]);
      return { ok: true, business: biz };
    },

    async getBusiness(id) {
      await ready;
      return businesses.find((b) => b.id === id) || null;
    },
    async getServices(businessId) {
      await ready;
      return services.filter((s) => s.businessId === businessId);
    },
    async addService({ businessId, name, durationMin }) {
      if (!businessId || !name || !durationMin) return null;
      const svc = { id: await nextId('svc'), businessId, name, durationMin, priceLabel: 'DEMO PRICE' };
      await db.query(
        'INSERT INTO services (id, business_id, name, duration_min, price_label) VALUES ($1,$2,$3,$4,$5)',
        [svc.id, svc.businessId, svc.name, svc.durationMin, svc.priceLabel]
      );
      services.push(svc);
      return svc;
    },
    async getStaff(businessId) {
      await ready;
      return staff.filter((s) => s.businessId === businessId);
    },
    async getAppointments(businessId) {
      await ready;
      return appointments.filter((a) => a.businessId === businessId);
    },
    async getAppointmentsForUser(userId) {
      await ready;
      const user = users.find((u) => u.id === userId);
      if (!user) return [];
      if (user.role === 'SUPER_ADMIN') return appointments;
      if (user.role === 'BUSINESS_OWNER' || user.role === 'STAFF') {
        return appointments.filter((a) => a.businessId === user.businessId);
      }
      return [];
    },
    async addAppointment(appt) {
      const row = { id: await nextId('appt'), status: 'CONFIRMED', createdAt: new Date().toISOString(), ...appt };
      await db.query(
        'INSERT INTO appointments (id, business_id, service_id, service_name, staff_id, staff_name, customer_phone, customer_name, date, start_min, end_min, status, source, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [row.id, row.businessId, row.serviceId || null, row.serviceName, row.staffId || null, row.staffName || null, row.customerPhone || null, row.customerName || null, row.date, row.startMin, row.endMin, row.status, row.source || null, row.createdAt]
      );
      appointments.push(row);
      return row;
    },
    async getOrCreateChat({ businessId, customerPhone, customerName }) {
      await ready;
      let chat = chats.find((c) => c.businessId === businessId && c.customerPhone === customerPhone);
      if (!chat) {
        chat = {
          id: await nextId('chat'),
          businessId,
          customerPhone,
          customerName: customerName || 'Demo Customer',
          messages: [],
        };
        await db.query(
          'INSERT INTO chats (id, business_id, customer_phone, customer_name) VALUES ($1,$2,$3,$4)',
          [chat.id, chat.businessId, chat.customerPhone, chat.customerName]
        );
        chats.push(chat);
      }
      return chat;
    },
    async addMessage(chat, { from, text }) {
      await ready;
      const msg = { id: await nextId('msg'), from, text, at: new Date().toISOString() };
      await db.query(
        'INSERT INTO messages (id, chat_id, sender, text, at) VALUES ($1,$2,$3,$4,$5)',
        [msg.id, chat.id, msg.from, msg.text, msg.at]
      );
      const cached = chats.find((c) => c.id === chat.id);
      if (cached) cached.messages.push(msg);
      else chat.messages.push(msg);
      return msg;
    },
  };

  return store;
}

module.exports = { createPgStore };
