#!/usr/bin/env node
// Provision N throwaway test users for the load test and write their
// credentials to loadtest/.users.json (gitignored). k6 signs a subset of them
// in to build its token pool.
//
// Requires the SERVICE ROLE key (admin API). Run against a STAGING project.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   COUNT=500 node loadtest/scripts/provision-users.mjs
//
// Idempotent-ish: re-running creates a fresh batch (emails are timestamped).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROD_REF = 'eyokhisijabitzjiydmz';
const URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COUNT = Number(process.env.COUNT || 500);
const PASSWORD = process.env.LOADTEST_PASSWORD || 'LoadTest!' + Math.random().toString(36).slice(2, 10);
const PROFILES = process.env.PROFILES !== '0'; // best-effort profile rows

if (!URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (URL.includes(PROD_REF) && process.env.LOADTEST_ALLOW_PROD !== 'yes-i-own-the-blast-radius') {
  console.error(`Refusing to provision test users in production (${PROD_REF}). Use a staging project.`);
  process.exit(1);
}

const admin = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};
const batchId = Date.now().toString(36);
const users = [];

console.log(`Provisioning ${COUNT} users against ${URL} ...`);
for (let i = 0; i < COUNT; i++) {
  const email = `loadtest+${batchId}-${i}@example.com`;
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) {
    console.error(`  user ${i} failed: ${res.status} ${await res.text()}`);
    continue;
  }
  const body = await res.json();
  const id = body.id || body.user?.id;
  users.push({ email, password: PASSWORD, id });

  if (PROFILES && id) {
    // Best-effort: the app joins profiles into the feed. Ignore failures
    // (a signup trigger may already create the row, or columns may differ).
    await fetch(`${URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...admin, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id, username: `loadtest_${batchId}_${i}`, display_name: `Load Test ${i}` }),
    }).catch(() => {});
  }
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${COUNT}`);
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.users.json');
writeFileSync(outPath, JSON.stringify(users, null, 2));
console.log(`\nDone. ${users.length} users written to ${outPath}`);
console.log(`Password for this batch: ${PASSWORD}`);
console.log('Tear them down afterward with scripts/teardown-users.mjs');
