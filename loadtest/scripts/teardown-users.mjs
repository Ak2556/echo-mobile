#!/usr/bin/env node
// Clean up after a load test: delete every [loadtest]-tagged echo, then delete
// the provisioned users listed in loadtest/.users.json.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node loadtest/scripts/teardown-users.mjs

import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROD_REF = 'eyokhisijabitzjiydmz';
const URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (URL.includes(PROD_REF) && process.env.LOADTEST_ALLOW_PROD !== 'yes-i-own-the-blast-radius') {
  console.error(`Refusing to run teardown against production (${PROD_REF}).`);
  process.exit(1);
}

const admin = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// 1. Delete tagged echoes (title starts with "[loadtest]").
console.log('Deleting [loadtest] echoes ...');
const delRes = await fetch(`${URL}/rest/v1/public_echoes?title=like.${encodeURIComponent('[loadtest]%')}`, {
  method: 'DELETE',
  headers: { ...admin, Prefer: 'return=representation' },
});
if (delRes.ok) {
  const removed = await delRes.json();
  console.log(`  removed ${Array.isArray(removed) ? removed.length : 0} echoes`);
} else {
  console.error(`  echo cleanup failed: ${delRes.status} ${await delRes.text()}`);
}

// 2. Delete provisioned users.
const usersPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.users.json');
let users = [];
try {
  users = JSON.parse(readFileSync(usersPath, 'utf8'));
} catch {
  console.log('No .users.json — nothing to delete.');
  process.exit(0);
}

console.log(`Deleting ${users.length} users ...`);
let deleted = 0;
for (const u of users) {
  if (!u.id) continue;
  const res = await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: admin });
  if (res.ok) deleted++;
  else console.error(`  user ${u.id} failed: ${res.status}`);
}
console.log(`  deleted ${deleted}/${users.length} users`);

rmSync(usersPath, { force: true });
console.log('Removed .users.json. Teardown complete.');
