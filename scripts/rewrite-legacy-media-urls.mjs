#!/usr/bin/env node
// Point the database's legacy Supabase Storage URLs at R2.
//
// Run AFTER scripts/migrate-storage-to-r2.mjs has copied the objects. Every
// target URL is HEAD-checked against the worker first, and a row is rewritten
// only when all of its URLs resolve — so running this too early rewrites
// nothing rather than breaking media.
//
// Why rewrite rows when lib/workerUrl.ts already normalises at read time: the
// normaliser ships inside a build, and no installed build can receive it. Every
// build was made with runtimeVersion "1.0.0", and since the fingerprint policy
// landed (8322452) no OTA matches them. Changing the rows is the only fix that
// reaches the apps people already have — and it covers every screen, where the
// normaliser only covers mapSupabaseEcho.
//
//   node scripts/rewrite-legacy-media-urls.mjs                   # dry run (default)
//   node scripts/rewrite-legacy-media-urls.mjs --apply
//   node scripts/rewrite-legacy-media-urls.mjs --revert <backup.json>
//
// Run from the repo root. Talks to Postgres through the linked Supabase CLI
// (`supabase db query --linked`), which reaches the database directly and keeps
// working while the project's HTTP APIs are restricted.
//
// --apply writes every old value to disk BEFORE touching a row, then applies all
// rows in one DO block guarded on the value it read: if any row changed in the
// meantime the block raises and nothing is written. It never touches storage.

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const WORKER_URL = (process.env.EXPO_PUBLIC_CLOUDFLARE_WORKER_URL || 'https://echo-mobile.at3236129.workers.dev').replace(/\/+$/, '');

// Mirrors normalizeLegacyMediaUrl in lib/workerUrl.ts — this is plain Node and
// cannot import TypeScript. rewrite-legacy-media-urls.test.ts asserts the two
// agree, so they cannot drift silently.
const LEGACY_PUBLIC_STORAGE = /^https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/([^/?#]+)\/([^?#]+)(\?[^#]*)?/i;
const PUBLIC_BUCKETS = ['avatars', 'echo-media', 'marketplace-photos'];

// Every column that held a legacy public URL on 2026-09-10, from a scan of all
// text, array and jsonb columns in `public`. dm-media URLs are left alone: that
// bucket is access-controlled and not served under /media.
export const TARGETS = [
  { table: 'public_echoes', column: 'media_urls' },
  { table: 'profiles', column: 'avatar_url' },
  { table: 'marketplace_listings', column: 'photo_urls' },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = '$rewrite$';

function log(...a) { console.log(...a); }

export function rewriteUrl(url, workerUrl = WORKER_URL) {
  if (!url) return url ?? undefined;
  const match = LEGACY_PUBLIC_STORAGE.exec(url);
  if (!match) return url;
  const [, bucket, path] = match;
  if (!PUBLIC_BUCKETS.includes(bucket)) return url;
  return `${workerUrl}/media/${bucket}/${decodeURIComponent(path).replace(/^\/+/, '')}`;
}

/** Rows as read -> the rows to change. `value` is a string or an array of strings. */
export function planRewrites(rows) {
  const plans = [];
  for (const { table, column, id, value } of rows) {
    const oldValues = Array.isArray(value) ? value : [value];
    const newValues = oldValues.map((u) => rewriteUrl(u));
    const targets = newValues.filter((u, i) => u !== oldValues[i]);
    if (targets.length === 0) continue;
    plans.push({ table, column, id, oldValue: value, newValue: Array.isArray(value) ? newValues : newValues[0], targets });
  }
  return plans;
}

function literal(s) {
  if (typeof s !== 'string') throw new Error(`refusing non-string value ${JSON.stringify(s)}`);
  if (s.includes(TAG)) throw new Error(`refusing value containing ${TAG}`);
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlValue(v) {
  return Array.isArray(v) ? `array[${v.map(literal).join(', ')}]::text[]` : literal(v);
}

/**
 * One DO block that applies every change or none. Each update is guarded on
 * the value it expects to replace; `from`/`to` pick the direction, so --revert
 * is the same code with the two swapped.
 */
export function buildDoBlock(plans, { from, to }) {
  const statements = plans.map((p) => {
    if (!TARGETS.some((t) => t.table === p.table && t.column === p.column)) {
      throw new Error(`refusing unknown column ${p.table}.${p.column}`);
    }
    if (!UUID.test(p.id)) throw new Error(`refusing non-uuid id ${p.id}`);
    return [
      `  update public.${p.table} set ${p.column} = ${sqlValue(p[to])} where id = '${p.id}' and ${p.column} = ${sqlValue(p[from])};`,
      '  get diagnostics n = row_count;',
      `  if n <> 1 then raise exception '${p.table} ${p.id} changed since it was read; nothing was written'; end if;`,
    ].join('\n');
  });
  return `do ${TAG}\ndeclare n int;\nbegin\n${statements.join('\n')}\nend\n${TAG};`;
}

function selectLegacySql() {
  return TARGETS.map(({ table, column }) =>
    `select '${table}' as "table", '${column}' as "column", id::text as id, to_jsonb(${column}) as value ` +
    `from public.${table} where ${column}::text like '%supabase.co/storage/v1/object/public/%'`,
  ).join('\nunion all\n');
}

/**
 * The first complete JSON value (object or array) in the CLI's stdout, or null.
 * The CLI can print other text around it, such as its "new version available"
 * notice. This walks brackets, skipping strings, to find where the value ends.
 *
 * Arrays matter: `supabase db query -o json` prints the rows as a bare array.
 * An earlier version looked only for `{`, parsed the FIRST ROW as the whole
 * result, found no `.rows` on it, and reported zero rows. That is the failure
 * this function must never repeat, so `rowsFrom` refuses any shape it does not
 * recognise instead of defaulting to [].
 */
export function extractJsonObject(text) {
  const match = /[[{]/.exec(text);
  if (!match) return null;
  const start = match.index;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON in CLI output: ${text.slice(start, start + 200)}`);
}

/** Rows from a parsed CLI result. Throws on anything unrecognised — never []. */
export function rowsFrom(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error(`unrecognised CLI JSON shape: ${JSON.stringify(parsed).slice(0, 200)}`);
}

async function query(sql, { rowsExpected = true } = {}) {
  const { stdout } = await run('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 32,
    env: { ...process.env, SUPABASE_INTERNAL_NO_UPDATE_CHECK: '1' },
  });
  const parsed = extractJsonObject(stdout);
  if (parsed === null) {
    // A DO block returns no rows, and the CLI may print nothing JSON-shaped for it.
    if (!rowsExpected) return [];
    throw new Error(`unexpected CLI output: ${stdout.slice(0, 200)}`);
  }
  return rowsExpected ? rowsFrom(parsed) : [];
}

function countLegacySql() {
  return 'select (' + TARGETS.map(({ table, column }) =>
    `(select count(*) from public.${table} where ${column}::text like '%supabase.co/storage/v1/object/public/%')`,
  ).join(' + ') + ')::int as n';
}

/** Cross-check: the row listing must agree with an independent count. */
async function legacyRows() {
  const rows = await query(selectLegacySql());
  const [countRow] = await query(countLegacySql());
  const n = Number(countRow?.n);
  if (!Number.isInteger(n)) throw new Error(`count query returned ${JSON.stringify(countRow)}`);
  if (n !== rows.length) throw new Error(`listing returned ${rows.length} rows but count says ${n}; refusing to continue`);
  return rows;
}

// The CLI may hand jsonb back parsed or as JSON text; a bare URL is never valid
// JSON, so parsing when possible is unambiguous.
function parseValue(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

/** In R2? The worker is the same path the app reads through. */
async function existsInR2(url) {
  const res = await fetch(encodeURI(url), { method: 'HEAD' });
  return res.status === 200 || res.status === 206;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--revert')) return revert(args[args.indexOf('--revert') + 1]);
  const APPLY = args.includes('--apply');

  log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — legacy Supabase Storage URLs -> ${WORKER_URL}\n`);

  const rows = (await legacyRows()).map((r) => ({ ...r, value: parseValue(r.value) }));
  const plans = planRewrites(rows);

  const present = new Set();
  for (const url of new Set(plans.flatMap((p) => p.targets))) {
    if (await existsInR2(url)) present.add(url);
  }
  const ready = plans.filter((p) => p.targets.every((u) => present.has(u)));
  const blocked = plans
    .filter((p) => !ready.includes(p))
    .map(({ table, column, id, targets }) => ({ table, column, id, missing: targets.filter((u) => !present.has(u)) }));

  for (const { table, column } of TARGETS) {
    const r = ready.filter((p) => p.table === table).length;
    const b = blocked.filter((p) => p.table === table).length;
    log(`  ${table}.${column}: ${r} ready, ${b} blocked on objects missing from R2`);
  }

  const report = { startedAt: new Date().toISOString(), apply: APPLY, workerUrl: WORKER_URL, ready, blocked };
  const path = `rewrite-legacy-media-${Date.now()}.json`;
  // Written before the DO block runs: with --apply this file is the backup.
  await writeFile(path, JSON.stringify(report, null, 2));
  log(`\n${APPLY ? 'backup' : 'report'}: ${path}`);

  if (blocked.length) {
    log(`${blocked.length} row(s) blocked — run scripts/migrate-storage-to-r2.mjs --apply first; the report lists each missing object.`);
  }
  if (!APPLY || ready.length === 0) return;

  await query(buildDoBlock(ready, { from: 'oldValue', to: 'newValue' }), { rowsExpected: false });
  const left = await legacyRows();
  log(`rewrote ${ready.length} row(s); ${left.length} still hold legacy URLs. Undo with --revert ${path}`);
}

async function revert(file) {
  if (!file) {
    console.error('--revert needs the backup file written by --apply');
    process.exit(2);
  }
  const report = JSON.parse(await readFile(file, 'utf8'));
  if (!report.apply) {
    console.error(`${file} is a dry-run report; nothing was applied from it`);
    process.exit(2);
  }
  await query(buildDoBlock(report.ready, { from: 'newValue', to: 'oldValue' }), { rowsExpected: false });
  log(`reverted ${report.ready.length} row(s) from ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e.stderr || e); process.exit(1); });
}
