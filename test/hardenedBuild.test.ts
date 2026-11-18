import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The hardened Android build (R8 + resource shrinking) is switched on by ECHO_HARDENED_BUILD=1, which
 * lives in the EAS "preview" environment. It must stay a flag: the plugin options are part of the
 * update fingerprint, so applying them to every build would strand installed apps from OTA.
 */
const ROOT = resolve(__dirname, '..');
const require_ = createRequire(import.meta.url);
const appConfig = require_(join(ROOT, 'app.config.js')) as (a: { config: { plugins?: unknown[] } }) => { plugins?: unknown[] };
const base = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo as { plugins: unknown[] };

const buildProps = (plugins: unknown[] | undefined) =>
  (plugins ?? []).find(p => (Array.isArray(p) ? p[0] : p) === 'expo-build-properties');

const original = process.env.ECHO_HARDENED_BUILD;
afterEach(() => {
  if (original === undefined) delete process.env.ECHO_HARDENED_BUILD;
  else process.env.ECHO_HARDENED_BUILD = original;
});

describe('hardened Android build flag', () => {
  it('leaves the plugin list exactly as app.json has it when the flag is off', () => {
    delete process.env.ECHO_HARDENED_BUILD;
    expect(appConfig({ config: base }).plugins).toEqual(base.plugins);
  });

  it('turns on R8 and resource shrinking, and nothing else, when the flag is 1', () => {
    process.env.ECHO_HARDENED_BUILD = '1';
    const out = appConfig({ config: base }).plugins;
    expect(buildProps(out)).toEqual([
      'expo-build-properties',
      { android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } },
    ]);
    expect(out).toHaveLength(base.plugins.length);
  });

  it('is not enabled by eas.json, which is part of the update fingerprint', () => {
    const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
    expect(JSON.stringify(eas)).not.toContain('ECHO_HARDENED_BUILD');
  });
});
