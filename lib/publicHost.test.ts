import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { PUBLIC_WEB_HOST, PUBLIC_WEB_ORIGIN, TRUSTED_WEB_HOSTS } from './publicHost';

/**
 * The regression this file exists to catch: the host the app *claims* (via
 * app.config.js, which feeds Info.plist associated domains and the Android
 * intent filters) silently disagreeing with the host the app *emits* (share
 * URLs, trusted deep links). When they disagree, universal links stop firing
 * and every shared link points somewhere we do not control — which is exactly
 * what happened, undetected, until launch prep.
 *
 * app.config.js is CommonJS loaded by Expo's config resolver, so it cannot
 * import publicHost.ts. Requiring it here and comparing the resolved values is
 * the only way to hold the two copies together.
 */
const requireCjs = createRequire(import.meta.url);
const appConfig = requireCjs('../app.config.js') as (arg: {
  config: Record<string, unknown>;
}) => { ios: { associatedDomains: string[] }; android: { intentFilters: Array<{ data: Array<{ host: string; scheme: string; pathPrefix: string }> }> } };

const resolved = appConfig({ config: { ios: {}, android: {} } });

describe('public web host', () => {
  it('matches the host iOS claims for universal links', () => {
    expect(resolved.ios.associatedDomains).toEqual([`applinks:${PUBLIC_WEB_HOST}`]);
  });

  it('matches the host Android claims for app links', () => {
    const hosts = new Set(resolved.android.intentFilters.flatMap(f => f.data.map(d => d.host)));
    expect([...hosts]).toEqual([PUBLIC_WEB_HOST]);
  });

  it('claims every path prefix the link parser can resolve', () => {
    // parseEchoUniversalLink understands /e, /u and /c. A prefix the parser
    // handles but Android does not claim is a link that opens the browser
    // instead of the app; the reverse is a verified link that lands nowhere.
    const prefixes = resolved.android.intentFilters
      .flatMap(f => f.data.map(d => d.pathPrefix))
      .sort();
    expect(prefixes).toEqual(['/c', '/e', '/u']);
  });

  it('requires https for every claimed filter', () => {
    const schemes = new Set(resolved.android.intentFilters.flatMap(f => f.data.map(d => d.scheme)));
    expect([...schemes]).toEqual(['https']);
  });

  it('is not a domain we failed to register', () => {
    // Guards the specific mistake: echo.app is parked and for sale.
    expect(PUBLIC_WEB_HOST).not.toBe('echo.app');
    expect(PUBLIC_WEB_ORIGIN).toBe(`https://${PUBLIC_WEB_HOST}`);
  });

  it('trusts the bare and www hosts, and nothing that merely contains them', () => {
    expect(TRUSTED_WEB_HOSTS.has(PUBLIC_WEB_HOST)).toBe(true);
    expect(TRUSTED_WEB_HOSTS.has(`www.${PUBLIC_WEB_HOST}`)).toBe(true);
    expect(TRUSTED_WEB_HOSTS.has(`${PUBLIC_WEB_HOST}.evil.test`)).toBe(false);
    expect(TRUSTED_WEB_HOSTS.has(`evil.${PUBLIC_WEB_HOST}`)).toBe(false);
  });
});
