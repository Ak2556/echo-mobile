import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * scripts/check-restored-counts.sh decides whether a backup is complete. A fake `psql` on the PATH
 * answers `select count(*) from <table>` from a fixture, so every branch runs without a database.
 */
const SCRIPT = join(__dirname, 'check-restored-counts.sh');
const dir = mkdtempSync(join(tmpdir(), 'echo-counts-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Prints the restored count for the table named in the query; exits 1 when the table is not restored.
writeFileSync(join(dir, 'psql'), `#!/usr/bin/env bash
q="\${@: -1}"
table=$(echo "$q" | sed -n 's/.*from \\([a-z_.]*\\).*/\\1/p')
v=$(grep "^$table=" "$RESTORED" | cut -d= -f2)
[ -n "$v" ] || exit 1
echo "$v"
`);
chmodSync(join(dir, 'psql'), 0o755);

function run(live: Record<string, number>, restored: Record<string, number>) {
  const lines = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  const liveFile = join(dir, 'live.txt');
  const restoredFile = join(dir, 'restored.txt');
  writeFileSync(liveFile, Object.keys(live).length ? lines(live) : '');
  writeFileSync(restoredFile, lines(restored));
  const r = spawnSync('bash', [SCRIPT, liveFile, 'postgresql://fake'], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RESTORED: restoredFile },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('check-restored-counts.sh', () => {
  it('passes when everything came back', () => {
    const r = run({ 'public.profiles': 51, 'auth.users': 51 }, { 'public.profiles': 51, 'auth.users': 51 });
    expect(r.code).toBe(0);
  });

  it('passes when rows arrived between the count and the dump', () => {
    expect(run({ 'public.profiles': 51 }, { 'public.profiles': 55 }).code).toBe(0);
  });

  it('fails when a table restored a fraction of its rows (the partial dump the old check passed)', () => {
    const r = run({ 'public.profiles': 51, 'public.direct_messages': 1000 }, { 'public.profiles': 51, 'public.direct_messages': 300 });
    expect(r.code).toBe(1);
    expect(r.out).toContain('public.direct_messages restored 300 rows but the live database had 1000');
  });

  it('fails when a table did not restore at all', () => {
    const r = run({ 'public.profiles': 51, 'auth.users': 51 }, { 'public.profiles': 51 });
    expect(r.code).toBe(1);
    expect(r.out).toContain('auth.users did not restore at all');
  });

  it('allows 1% fewer, and no more, on a big table', () => {
    expect(run({ 't.a': 1000 }, { 't.a': 990 }).code).toBe(0);
    expect(run({ 't.a': 1000 }, { 't.a': 989 }).code).toBe(1);
  });

  it('allows one row fewer on a small table, and no more', () => {
    expect(run({ 't.a': 3 }, { 't.a': 2 }).code).toBe(0);
    expect(run({ 't.a': 3 }, { 't.a': 1 }).code).toBe(1);
  });

  it('treats an empty counts file as a failure, not a pass', () => {
    const r = run({}, { 't.a': 1 });
    expect(r.code).toBe(1);
    expect(r.out).toContain('nothing was checked');
  });

  it('refuses to run without its arguments', () => {
    const r = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
