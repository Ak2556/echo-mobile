/**
 * supabase/recovery/ is how the database is rebuilt if the project is lost. The 2026-10-16 drill
 * found the ways it rots: a snapshot taken before a migration silently lacks it; a queue the code
 * sends to is missing, so every post fails; a vault secret the cron jobs read is not on the
 * checklist, so a rebuilt database looks healthy and does nothing. These keep the bundle honest.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

const migrations = readdirSync(join(ROOT, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
const versions = migrations.map(f => f.split('_')[0]);
const schema = read('supabase/recovery/schema.sql');
const bootstrap = read('supabase/recovery/bootstrap.sql');
const sources = [
  ...migrations.map(f => read(`supabase/migrations/${f}`)),
  ...walk('supabase/functions').filter(f => f.endsWith('.ts')).map(read),
].join('\n');

describe('recovery bundle', () => {
  it('the snapshot is stamped with a migration that exists', () => {
    const stamp = schema.match(/^-- through migration:\s*(\d+)\s*$/m)?.[1];
    expect(stamp, 'schema.sql needs a "-- through migration: <version>" line').toBeTruthy();
    expect(versions, `no migration has version ${stamp}`).toContain(stamp);
  });

  it('the snapshot is not more than 40 migrations behind (refresh it; see the README)', () => {
    const stamp = schema.match(/^-- through migration:\s*(\d+)/m)![1];
    const tail = versions.filter(v => Number(v) > Number(stamp)).length;
    expect(tail).toBeLessThanOrEqual(40);
  });

  it('every queue the code sends to or reads from is created by the bootstrap', () => {
    const used = new Set([...sources.matchAll(/(?:pgmq\.(?:send|send_batch|read|archive|delete)|jobs_enqueue)\(\s*'([a-z_]+)'/g)].map(m => m[1]));
    expect(used.size).toBeGreaterThan(5);
    const created = new Set([...bootstrap.matchAll(/pgmq\.create\('([a-z_]+)'\)/g)].map(m => m[1]));
    const missing = [...used].filter(q => !created.has(q));
    expect(missing, `queues used but not created in bootstrap.sql: ${missing.join(', ')}`).toEqual([]);
  });

  it('every vault secret read by name is on the bootstrap checklist', () => {
    const used = new Set([...sources.matchAll(/decrypted_secrets[^;]{0,200}?name\s*=\s*'([a-z_]+)'/gs)].map(m => m[1]));
    expect(used.size).toBeGreaterThan(4);
    const listed = bootstrap.match(/unnest\(array\[([^\]]+)\]\)/)?.[1] ?? '';
    const missing = [...used].filter(n => !listed.includes(`'${n}'`));
    expect(missing, `vault secrets read but not on the checklist: ${missing.join(', ')}`).toEqual([]);
  });

  it('every cron job calls a function that exists in the snapshot', () => {
    const calls = [...bootstrap.matchAll(/\$cmd\$\s*select public\.([a-z_]+)\(/g)].map(m => m[1]);
    expect(calls.length).toBeGreaterThan(4);
    for (const fn of calls) expect(schema, `public.${fn} is not in schema.sql`).toMatch(new RegExp(`FUNCTION "public"\\."${fn}"\\(`));
  });

  it('holds no secret material', () => {
    for (const f of ['schema.sql', 'auth-storage.sql', 'bootstrap.sql', 'seed-content.sql', 'README.md']) {
      const text = read(`supabase/recovery/${f}`);
      expect(text, `${f} has a JWT`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
      expect(text, `${f} has an sb_secret key`).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/);
      expect(text, `${f} has a long hex secret`).not.toMatch(/['"][0-9a-f]{40,}['"]/);
    }
  });
});
