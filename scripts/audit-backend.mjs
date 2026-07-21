#!/usr/bin/env node
// Backend drift audit — automates the checks that caught every silent outage
// in July 2026: delisted AI model IDs, missing storage buckets, and app enums
// drifting from DB check constraints.
//
// Run: node scripts/audit-backend.mjs
// Exits non-zero on any failure, so it can gate CI.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://eyokhisijabitzjiydmz.supabase.co';
const ANON_KEY = 'sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4';

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ❌ ${msg}`); };
const ok = (msg) => console.log(`  ✅ ${msg}`);

function* walk(dir, exts) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p, exts);
    else if (exts.some((e) => entry.name.endsWith(e))) yield p;
  }
}

function readAll(dirs, exts) {
  let out = '';
  for (const dir of dirs) for (const f of walk(join(ROOT, dir), exts)) out += readFileSync(f, 'utf8') + '\n';
  return out;
}

// ── 1. AI model IDs vs OpenRouter catalogs ─────────────────────────────────
console.log('\n[1/3] AI model IDs vs OpenRouter catalogs');
{
  const src = readAll(['supabase/functions', 'lib'], ['.ts']);
  const referenced = [...new Set([...src.matchAll(/["'`](google\/[a-z0-9.\-]+|openai\/[a-z0-9.\-]+|mistralai\/[a-z0-9.\-]+)["'`]/g)].map((m) => m[1]))];
  const [chat, emb] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/models').then((r) => r.json()),
    fetch('https://openrouter.ai/api/v1/embeddings/models').then((r) => r.json()),
  ]);
  const valid = new Set([...chat.data, ...emb.data].map((m) => m.id));
  for (const id of referenced) {
    if (valid.has(id)) ok(id);
    else fail(`${id} — not in OpenRouter chat or embeddings catalog (delisted?)`);
  }
}

// ── 2. Storage buckets referenced in code exist in prod ────────────────────
console.log('\n[2/3] Storage buckets');
{
  const src = readAll(['lib', 'app', 'components', 'supabase/functions'], ['.ts', '.tsx']);
  const buckets = [...new Set([...src.matchAll(/storage\s*[\n\s]*\.from\(["'`]([a-z0-9\-]+)["'`]\)/g)].map((m) => m[1]))];
  for (const b of buckets) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${b}/__audit_probe__`, {
      headers: { apikey: ANON_KEY },
    });
    const body = await res.text();
    // Public bucket, missing object → "Object not found". Private bucket →
    // public endpoint hides it; probe the auth'd list endpoint instead.
    if (body.includes('Object not found')) { ok(`${b} (public)`); continue; }
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${b}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1 }),
    });
    // Any response other than "Bucket not found" means the bucket exists
    // (RLS denials still prove existence).
    const listBody = await listRes.text();
    if (listBody.includes('Bucket not found')) fail(`${b} — bucket missing in production`);
    else ok(`${b} (private or restricted)`);
  }
}

// ── 3. App enums vs migration check constraints ────────────────────────────
console.log('\n[3/3] Enum ↔ check-constraint sync');
{
  const migrations = readAll(['supabase/migrations'], ['.sql']);
  const latestConstraint = (column) => {
    // Last occurrence in migration order wins (files are read in name order).
    const re = new RegExp(`${column}\\s+in\\s*\\(([^)]+)\\)`, 'gi');
    let last = null;
    for (const m of migrations.matchAll(re)) last = m[1];
    if (!last) return null;
    return new Set([...last.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  };

  const checks = [
    {
      name: 'direct_messages.kind',
      db: latestConstraint('kind'),
      app: [...new Set([...readAll(['lib', 'app', 'hooks'], ['.ts', '.tsx']).matchAll(/kind:\s*['"](text|image|voice|echo|link|contact)['"]/g)].map((m) => m[1]))],
    },
    {
      name: 'marketplace_listings.condition',
      db: latestConstraint('condition'),
      app: [...readFileSync(join(ROOT, 'lib/marketplaceApi.ts'), 'utf8').matchAll(/ListingCondition = ([^;]+);/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])),
    },
    {
      name: 'marketplace_listings.currency',
      db: latestConstraint('currency'),
      app: [...new Set([...readFileSync(join(ROOT, 'lib/currency.ts'), 'utf8').matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]))],
    },
    {
      name: 'profiles.ai_model',
      db: latestConstraint('ai_model'),
      app: [...readFileSync(join(ROOT, 'lib/api.ts'), 'utf8').matchAll(/EchoAIModel = ([^;]+);/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])),
    },
  ];

  for (const c of checks) {
    if (!c.db) { fail(`${c.name} — no check constraint found in migrations`); continue; }
    const missing = c.app.filter((v) => !c.db.has(v));
    if (missing.length) fail(`${c.name} — app uses values not in DB constraint: ${missing.join(', ')}`);
    else ok(`${c.name} (${c.app.length} app values all allowed)`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
