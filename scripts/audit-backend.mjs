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
console.log('\n[1/6] AI model IDs vs OpenRouter catalogs');
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
console.log('\n[2/6] Storage buckets');
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
console.log('\n[3/6] Enum ↔ check-constraint sync');
{
  const migrations = readAll(['supabase/migrations'], ['.sql']);
  // Scoped to the owning table: matching on column name alone meant any later
  // migration that happened to add a `kind`, `condition` or `currency` check to
  // an unrelated table hijacked the comparison and reported a false drift.
  // ad_events.kind in ('view','click') did exactly that to direct_messages.kind.
  const latestConstraint = (table, column) => {
    const re = new RegExp(`${column}\\s+in\\s*\\(([^)]+)\\)`, 'gi');
    const owns = new RegExp(`\\b${table}\\b`, 'i');
    let last = null;
    for (const m of migrations.matchAll(re)) {
      // The statement containing this match must name the table it belongs to.
      const from = migrations.lastIndexOf(';', m.index) + 1;
      const to = migrations.indexOf(';', m.index);
      const statement = migrations.slice(from, to === -1 ? undefined : to);
      if (!owns.test(statement)) continue;
      last = m[1]; // last match in migration order wins
    }
    if (!last) return null;
    return new Set([...last.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  };

  const checks = [
    {
      name: 'direct_messages.kind',
      db: latestConstraint('direct_messages', 'kind'),
      app: [...new Set([...readAll(['lib', 'app', 'hooks'], ['.ts', '.tsx']).matchAll(/kind:\s*['"](text|image|voice|echo|link|contact)['"]/g)].map((m) => m[1]))],
    },
    {
      name: 'marketplace_listings.condition',
      db: latestConstraint('marketplace_listings', 'condition'),
      app: [...readFileSync(join(ROOT, 'lib/marketplaceApi.ts'), 'utf8').matchAll(/ListingCondition = ([^;]+);/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])),
    },
    {
      name: 'marketplace_listings.currency',
      db: latestConstraint('marketplace_listings', 'currency'),
      app: [...new Set([...readFileSync(join(ROOT, 'lib/currency.ts'), 'utf8').matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]))],
    },
    {
      name: 'profiles.ai_model',
      db: latestConstraint('profiles', 'ai_model'),
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

console.log('\n[4/6] Legal entity placeholders');
{
  // constants/legal/entity.ts is TypeScript, so it cannot be imported here.
  // hasUnresolvedEntityFacts() is the source of truth for WHICH constants must
  // be resolved; read that list out of the file and check each declaration, so
  // adding a constant to the guard automatically covers it here too.
  const src = readFileSync(join(ROOT, 'constants/legal/entity.ts'), 'utf8');
  const guard = src.match(/hasUnresolvedEntityFacts\(\)[^{]*\{\s*return \[([^\]]+)\]/);

  if (!guard) {
    fail('hasUnresolvedEntityFacts() not found in constants/legal/entity.ts — the legal guard has been removed or renamed');
  } else {
    const required = guard[1].split(',').map((n) => n.trim()).filter(Boolean);
    for (const name of required) {
      const decl = src.match(new RegExp(`export const ${name}\\s*=\\s*([^;]+);`));
      if (!decl) fail(`${name} — referenced by the guard but not declared`);
      else if (decl[1].includes('[[')) fail(`${name} — still an unresolved placeholder`);
      else ok(`${name} resolved`);
    }
  }

  const euRep = readFileSync(join(ROOT, 'constants/legal/euRepresentative.ts'), 'utf8');
  if (euRep.includes('[[')) fail('euRepresentative.ts — unresolved placeholder');
}

console.log('\n[5/6] Ad counter dedup');
{
  // The primary key of ad_events IS the dedup rule for increment_ad_view /
  // increment_ad_click. Drop it and both counters silently return to being
  // unbounded — no error, no failing test, just numbers an advertiser is shown
  // that anyone can inflate. Assert it survives in the migration history.
  const sql = readAll(['supabase/migrations'], ['.sql']);

  const hasTable = /create table if not exists public\.ad_events/i.test(sql);
  const hasPk = /primary key \(ad_id, user_id, kind, day\)/i.test(sql);
  const dropped = /drop table[^;]*ad_events/i.test(sql)
    || /alter table[^;]*ad_events[^;]*drop constraint[^;]*pkey/i.test(sql);

  if (!hasTable) fail('ad_events table is not created by any migration');
  else if (!hasPk) fail('ad_events has lost its (ad_id, user_id, kind, day) primary key — the dedup rule');
  else if (dropped) fail('a later migration drops ad_events or its primary key — dedup is off');
  else ok('ad_events dedup key intact');

  // Both counters must go through the guard rather than incrementing directly.
  for (const fn of ['increment_ad_view', 'increment_ad_click']) {
    const bodies = [...sql.matchAll(new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?\\$\\$;`, 'gi'))];
    const latest = bodies[bodies.length - 1]?.[0] ?? '';
    if (!latest) fail(`${fn} — not found in migrations`);
    else if (!/record_ad_event/.test(latest)) fail(`${fn} — newest definition does not call record_ad_event; dedup is bypassed`);
    else ok(`${fn} goes through record_ad_event`);
  }
}

console.log('\n[6/6] Mini-app fact queue');
{
  // A queue that silently accumulates failures is the exact shape of the bugs
  // this script exists to catch: green everywhere, dead in fact. The count
  // lives on-device, so what is asserted here is that the plumbing that
  // surfaces it is still wired.
  //
  // Read the source files directly rather than via readAll(['lib/minilink']),
  // which would also pull in links.test.ts — the tests reference every one of
  // these symbols too, so a walk that includes them would report healthy even
  // if queue.ts or drain.ts lost the behaviour entirely.
  const src = readFileSync(join(ROOT, 'lib/minilink/queue.ts'), 'utf8')
    + readFileSync(join(ROOT, 'lib/minilink/drain.ts'), 'utf8');

  // Anchored with \s*\( so a superset rename (listFailed -> listFailed2)
  // cannot walk past the check by leaving the old name as a literal prefix —
  // it also pins the match to a real function declaration rather than a
  // substring that could appear in a comment or string.
  if (!/export function markFailure\s*\(/.test(src)) fail('minilink queue has no markFailure — failures cannot be recorded');
  else if (!/status:\s*attempts >= MAX_FACT_ATTEMPTS/.test(src)) fail('minilink queue no longer parks exhausted facts as failed');
  else ok('failed facts are parked, not dropped');

  if (!/export function listFailed\s*\(/.test(src)) fail('minilink queue has no listFailed — failures cannot be surfaced');
  else ok('failed facts are queryable');

  // Identifier-generic on the receiver so a harmless rename of the loop
  // variable (fact -> f) doesn't false-fail, while the call shape itself —
  // guarding on some record's .id — still has to survive.
  if (!/hasApplied\([a-zA-Z_$][\w$]*\.id\)/.test(src)) fail('drain no longer checks the ledger — delivery is not idempotent');
  else ok('drain is ledger-guarded');
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
