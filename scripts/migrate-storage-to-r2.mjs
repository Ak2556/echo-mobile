#!/usr/bin/env node
// One-time backfill: copy legacy objects from Supabase Storage into the R2
// buckets the worker already serves.
//
// Uploads have gone to R2 for a while; only historical objects remain behind.
// That split is why some media 402'd when the project hit its egress quota
// while newer media kept serving. See
// docs/superpowers/specs/2026-09-10-storage-r2-migration-design.md
//
//   node scripts/migrate-storage-to-r2.mjs              # dry run (default)
//   node scripts/migrate-storage-to-r2.mjs --apply      # actually copy
//   node scripts/migrate-storage-to-r2.mjs --bucket echo-media
//
// Requires SUPABASE_SERVICE_ROLE_KEY to list objects (listing is not public),
// and a wrangler login for the R2 writes.
//
// It NEVER deletes anything. Re-running is safe: an object already present in
// R2 is skipped, so a run that dies halfway costs only what it had not reached.

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://eyokhisijabitzjiydmz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WORKER_URL = process.env.EXPO_PUBLIC_CLOUDFLARE_WORKER_URL || 'https://echo-mobile.at3236129.workers.dev';

// Exactly the buckets the worker serves at /media, mirroring PublicBucket in
// lib/workerUrl.ts. dm-media is access-controlled and lives behind /dm-media;
// `verification` holds selfies and has no R2 bucket at all.
const BUCKETS = ['avatars', 'echo-media', 'mini-app-media', 'marketplace-photos'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = args.includes('--bucket') ? args[args.indexOf('--bucket') + 1] : null;

const report = { startedAt: new Date().toISOString(), apply: APPLY, buckets: {}, failures: [] };

function log(...a) { console.log(...a); }

/** Page through a bucket. Supabase caps `list` at 100 per call. */
async function listAll(bucket) {
  const out = [];
  const PAGE = 100;
  // Objects live one directory deep (`<userId>/<file>`), and list() does not
  // recurse — so enumerate the top level, then each prefix under it.
  const listOne = async (prefix) => {
    const found = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      if (!res.ok) throw new Error(`list ${bucket}/${prefix} -> HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
      const page = await res.json();
      found.push(...page);
      if (page.length < PAGE) break;
    }
    return found;
  };

  for (const entry of await listOne('')) {
    // A folder placeholder has no id; a real object does.
    if (entry.id) { out.push(entry.name); continue; }
    for (const child of await listOne(entry.name)) {
      if (child.id) out.push(`${entry.name}/${child.name}`);
    }
  }
  return out;
}

/** Already in R2? The worker is the same path the app reads through. */
async function existsInR2(bucket, key) {
  const res = await fetch(`${WORKER_URL}/media/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, { method: 'HEAD' });
  return res.status === 200 || res.status === 206;
}

async function copyOne(bucket, key, dir) {
  const src = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`download ${bucket}/${key} -> HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const tmp = join(dir, 'object.bin');
  await writeFile(tmp, body);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  await run('npx', [
    'wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
    '--file', tmp, '--content-type', contentType, '--remote',
  ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 32 });
  return body.length;
}

async function main() {
  if (!SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required to list objects. Listing is not public.');
    process.exit(2);
  }
  log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — copying Supabase Storage -> R2\n`);

  const dir = await mkdtemp(join(tmpdir(), 'r2-migrate-'));
  try {
    for (const bucket of BUCKETS) {
      if (ONLY && bucket !== ONLY) continue;
      log(`[${bucket}]`);
      const stat = { total: 0, copied: 0, skipped: 0, failed: 0, bytes: 0 };
      let keys;
      try {
        keys = await listAll(bucket);
      } catch (e) {
        log(`  ! cannot list: ${e.message}`);
        report.failures.push({ bucket, stage: 'list', error: e.message });
        report.buckets[bucket] = stat;
        continue;
      }
      stat.total = keys.length;
      for (const key of keys) {
        try {
          if (await existsInR2(bucket, key)) { stat.skipped += 1; continue; }
          if (!APPLY) { log(`  would copy ${key}`); stat.copied += 1; continue; }
          stat.bytes += await copyOne(bucket, key, dir);
          stat.copied += 1;
          log(`  copied ${key}`);
        } catch (e) {
          stat.failed += 1;
          report.failures.push({ bucket, key, stage: 'copy', error: e.message });
          log(`  ! ${key}: ${e.message}`);
        }
      }
      report.buckets[bucket] = stat;
      log(`  ${stat.total} objects — ${stat.copied} ${APPLY ? 'copied' : 'to copy'}, ${stat.skipped} already in R2, ${stat.failed} failed\n`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  report.finishedAt = new Date().toISOString();
  const path = `migrate-r2-report-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  log(`report: ${path}`);
  if (report.failures.length) {
    log(`\n${report.failures.length} failure(s) — nothing was deleted, re-run to retry only what is missing.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
