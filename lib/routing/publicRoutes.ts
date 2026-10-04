/**
 * Routes a signed-out visitor is allowed to stay on.
 *
 * AuthGuard in app/_layout.tsx redirects to /auth/login from anything not
 * listed here. The legal documents belong on the list: the login footer links
 * to Terms and Privacy, App Store review opens them before creating an
 * account, and the DSA contact routes are meant to be readable by anyone.
 * While they were guarded, those links bounced straight back to login.
 *
 * They are static documents rendered from constants/legal — no user data, no
 * queries — so nothing is exposed by leaving them open.
 */
const PUBLIC_ROUTES = new Set([
  '/',
  '/welcome',
  '/onboarding',
  '/terms',
  '/privacy',
]);

/** Everything under these, plus the prefix itself. */
const PUBLIC_PREFIXES = ['/auth', '/legal'];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  // Match a path segment, not a string prefix: /authorised-dealers is not
  // /auth, and /privacy-settings is not /privacy.
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
