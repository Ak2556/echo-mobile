import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The script writes into the real public/ folder, so each case restores the two
// committed outputs and removes the env-dependent ones.
const root = join(__dirname, '..');
const pub = join(root, 'public');
const tracked = ['_redirects', '_headers'].map(f => join(pub, f));
let saved: string[] = [];

const FINGERPRINT = '64:63:5D:45:86:07:C3:20:93:F3:86:E3:B8:6B:71:62:0F:F3:38:07:F9:EB:0A:53:C1:9C:89:9B:9B:06:54:C1';

function run(env: Record<string, string>) {
  const clean = { ...process.env, APPLE_TEAM_ID: '', ANDROID_CERT_SHA256: '' };
  const res = spawnSync('node', [join(root, 'scripts/prepare-web-assets.mjs')], { env: { ...clean, ...env }, encoding: 'utf8' });
  expect(res.status, res.stderr).toBe(0);
  return res.stdout;
}

beforeEach(() => {
  saved = tracked.map(f => readFileSync(f, 'utf8'));
  rmSync(join(pub, '.well-known'), { recursive: true, force: true });
  rmSync(join(pub, 'wk'), { recursive: true, force: true });
});

afterEach(() => {
  tracked.forEach((f, i) => writeFileSync(f, saved[i]));
  rmSync(join(pub, '.well-known'), { recursive: true, force: true });
  rmSync(join(pub, 'wk'), { recursive: true, force: true });
});

describe('prepare-web-assets: /wk mirror', () => {
  it('serves each well-known file from a dot-free copy, because a folder drag-and-drop drops dot-folders', () => {
    run({ ANDROID_CERT_SHA256: FINGERPRINT, APPLE_TEAM_ID: 'ABCDE12345' });

    for (const name of ['assetlinks.json', 'apple-app-site-association']) {
      expect(readFileSync(join(pub, 'wk', name), 'utf8')).toBe(readFileSync(join(pub, '.well-known', name), 'utf8'));
    }
    const redirects = readFileSync(join(pub, '_redirects'), 'utf8');
    expect(redirects).toContain('/.well-known/assetlinks.json    /wk/assetlinks.json    200!');
    expect(redirects).toContain('/.well-known/apple-app-site-association    /wk/apple-app-site-association    200!');
  });

  it('puts the well-known rewrites ahead of the catch-all that would 404 them', () => {
    run({ ANDROID_CERT_SHA256: FINGERPRINT });
    const redirects = readFileSync(join(pub, '_redirects'), 'utf8');
    expect(redirects.indexOf('/.well-known/assetlinks.json')).toBeGreaterThan(-1);
    expect(redirects.indexOf('/.well-known/assetlinks.json')).toBeLessThan(redirects.indexOf('/*    /+not-found.html'));
  });

  it('mirrors only what exists, so no APPLE_TEAM_ID still means no AASA rewrite', () => {
    run({ ANDROID_CERT_SHA256: FINGERPRINT });
    expect(existsSync(join(pub, 'wk', 'assetlinks.json'))).toBe(true);
    expect(existsSync(join(pub, 'wk', 'apple-app-site-association'))).toBe(false);
    expect(readFileSync(join(pub, '_redirects'), 'utf8')).not.toContain('apple-app-site-association');
  });

  it('writes no rewrite and no mirror when nothing is configured', () => {
    run({});
    expect(existsSync(join(pub, 'wk'))).toBe(false);
    expect(readFileSync(join(pub, '_redirects'), 'utf8')).not.toContain('.well-known');
  });

  it('removes a stale mirror when the variable is later unset', () => {
    run({ ANDROID_CERT_SHA256: FINGERPRINT });
    run({});
    expect(existsSync(join(pub, 'wk'))).toBe(false);
    expect(existsSync(join(pub, '.well-known', 'assetlinks.json'))).toBe(false);
  });

  it('labels the mirror as JSON, since the files have no extension to infer it from', () => {
    run({});
    expect(readFileSync(join(pub, '_headers'), 'utf8')).toContain('/wk/*\n  Content-Type: application/json');
  });
});
