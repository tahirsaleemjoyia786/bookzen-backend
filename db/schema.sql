-- BookZen Phase 1 — Postgres schema (Supabase SQL Editor compatible).
-- Run this ONCE in the Supabase SQL Editor (or with backend/db/setup.js).
-- Idempotent: CREATE TABLE IF NOT EXISTS + seed rows with
-- ON CONFLICT DO NOTHING, so running it twice changes nothing.
-- No real business data: the seed is the same DEMO data as store.js
-- (Demo Barbershop, Demo Owner, 3 demo services, Demo Barber A/B).
-- Tables mirror the in-memory store shapes exactly:
--   users, businesses, services, staff, appointments, chats, messages,
--   plus id_counters (one global sequence, same as store.js `seq`).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  business_id TEXT,
  staff_id TEXT
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'barbershop',
  status TEXT NOT NULL DEFAULT 'PENDING',
  plan TEXT,
  owner_name TEXT,
  owner_phone TEXT,
  working_hours JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id),
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price_label TEXT NOT NULL DEFAULT 'DEMO PRICE'
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id),
  service_id TEXT,
  service_name TEXT NOT NULL,
  staff_id TEXT,
  staff_name TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id),
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  UNIQUE (business_id, customer_phone)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats (id),
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One global sequence, exactly like the in-memory store's `seq`.
-- After the seed below, next_val is 8, so the first real signup is biz_8.
CREATE TABLE IF NOT EXISTS id_counters (
  prefix TEXT PRIMARY KEY,
  next_val INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_services_business ON services (business_id);
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff (business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_business_date ON appointments (business_id, date);
CREATE INDEX IF NOT EXISTS idx_chats_business ON chats (business_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id);

-- ---------------------------------------------------------------------------
-- Seed (only if the tables are empty / the row does not exist yet).
-- IDs match store.js exactly: svc_1..svc_3, staff_4 + user_staff_5,
-- staff_6 + user_staff_7, so the next generated id is *_8.
-- ON CONFLICT DO NOTHING keeps this idempotent (safe to run twice).
-- ---------------------------------------------------------------------------

INSERT INTO users (id, name, role, phone, business_id, staff_id) VALUES
  ('user_admin', 'Demo Super Admin', 'SUPER_ADMIN', '+920000000000', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO businesses (id, name, type, status, plan, owner_name, owner_phone, working_hours) VALUES
  ('biz_demo_barbershop',
   'Demo Barbershop (DEMO ONLY — not a real business)',
   'barbershop', 'ACTIVE', 'DEMO', 'Demo Owner', '+920000000001',
   '{"monday":{"open":"09:00","close":"19:00"},"tuesday":{"open":"09:00","close":"19:00"},"wednesday":{"open":"09:00","close":"19:00"},"thursday":{"open":"09:00","close":"19:00"},"friday":{"open":"09:00","close":"19:00"},"saturday":{"open":"09:00","close":"18:00"},"sunday":{"open":"10:00","close":"16:00"}}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, role, phone, business_id, staff_id) VALUES
  ('user_demo_owner', 'Demo Owner', 'BUSINESS_OWNER', '+920000000001', 'biz_demo_barbershop', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO services (id, business_id, name, duration_min, price_label) VALUES
  ('svc_1', 'biz_demo_barbershop', 'Demo Haircut', 30, 'DEMO PRICE'),
  ('svc_2', 'biz_demo_barbershop', 'Demo Beard Trim', 20, 'DEMO PRICE'),
  ('svc_3', 'biz_demo_barbershop', 'Demo Skin Fade', 40, 'DEMO PRICE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff (id, business_id, name) VALUES
  ('staff_4', 'biz_demo_barbershop', 'Demo Barber A'),
  ('staff_6', 'biz_demo_barbershop', 'Demo Barber B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, role, phone, business_id, staff_id) VALUES
  ('user_staff_5', 'Demo Barber A', 'STAFF', '+920000000002', 'biz_demo_barbershop', 'staff_4'),
  ('user_staff_7', 'Demo Barber B', 'STAFF', '+920000000002', 'biz_demo_barbershop', 'staff_6')
ON CONFLICT (id) DO NOTHING;

INSERT INTO id_counters (prefix, next_val) VALUES ('seq', 8)
ON CONFLICT (prefix) DO NOTHING;
