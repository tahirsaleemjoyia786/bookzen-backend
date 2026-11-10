// BookZen Phase 1 — apply db/schema.sql to a Postgres database.
// Run:  DATABASE_URL="postgres://..." node db/setup.js
// (Windows CMD:  set DATABASE_URL=postgres://...  then  node db/setup.js)
// No connection string is stored in this file or anywhere in the repo:
// it comes from the DATABASE_URL environment variable only, and must
// never be pasted into chat. If DATABASE_URL is not set, this exits
// with an error and changes nothing.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Set it first (see SUPABASE-GUIDE.md), then run this again.');
    process.exit(1);
  }
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const pool = new Pool({ connectionString });
  try {
    await pool.query(schema);
    console.log('Schema applied OK (tables created if needed, demo seed inserted if empty).');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Setup failed:', e.message || e);
  process.exit(1);
});
