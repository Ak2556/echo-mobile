/**
 * The one place the public web host is written down.
 *
 * It used to be written in four places, and they drifted. app.config.js
 * derived `downloadecho.com` and claimed it for Universal Links and App
 * Links, while lib/echoUrl.ts, lib/urlSafety.ts and lib/auth/listener.ts all
 * defaulted to `echo.app` — a domain we do not own, parked for sale and
 * redirecting to a domain broker.
 *
 * The consequences were not subtle: every echo a user shared advertised a
 * domain listing, and no universal link could ever fire, because the host the
 * app claims and the host the app emits have to be the same host for the OS to
 * match them.
 *
 * So: this module owns the value, and the resolution below mirrors
 * launchHost() in app.config.js exactly. publicHost.test.ts asserts the two
 * still agree, because app.config.js is CommonJS consumed by the Expo config
 * loader and cannot import this file.
 */

/** Used whenever the environment does not name a host, or names a bad one. */
const DEFAULT_HOST = 'downloadecho.com';

/**
 * Origin only — any path in the env var is dropped. A web build served under a
 * subpath cannot support app links anyway, because app.config.js registers
 * path prefixes against the host root, so honouring a path here would produce
 * share URLs the OS would refuse to match.
 */
function resolveHost(): string {
  const raw = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  if (!raw) return DEFAULT_HOST;

  try {
    const parsed = new URL(raw);
    // Plain http is rejected rather than upgraded: universal links require
    // https, so an http base URL is a misconfiguration, not a preference.
    return parsed.protocol === 'https:' && parsed.hostname
      ? parsed.hostname.toLowerCase()
      : DEFAULT_HOST;
  } catch {
    return DEFAULT_HOST;
  }
}

export const PUBLIC_WEB_HOST = resolveHost();

export const PUBLIC_WEB_ORIGIN = `https://${PUBLIC_WEB_HOST}`;

/**
 * Hosts whose links we will act on — parse into a route, or accept as an auth
 * callback. `www.` is included because a user can paste either form; nothing
 * else is, and subdomain matching is deliberately absent so that
 * `downloadecho.com.evil.test` cannot pass.
 */
export const TRUSTED_WEB_HOSTS: ReadonlySet<string> = new Set([
  PUBLIC_WEB_HOST,
  `www.${PUBLIC_WEB_HOST}`,
]);
