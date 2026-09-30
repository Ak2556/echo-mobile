/**
 * Where the analytics consent banner may appear.
 *
 * It is a bottom card, and on the sign-in screens it sat on top of "Already
 * have an account? Log in" and the Terms/Privacy links, so a returning user
 * had to answer an analytics question before they could reach Log in
 * (2026-09-30 release audit). Analytics only starts after "Accept", so
 * waiting until the user is inside the app costs nothing and tracks nothing.
 */
export function consentBannerAllowedOn(pathname: string): boolean {
  if (pathname === '/' || pathname === '/welcome') return false;
  return !pathname.startsWith('/auth') && !pathname.startsWith('/onboarding');
}
