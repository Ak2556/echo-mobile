// One set of handle rules for every screen that sets a username.
//
// Mentions only match [a-zA-Z0-9_] (see extractMentions in supabaseEchoApi), so
// a handle with a space, dot or apostrophe can't be @mentioned. Edit Profile
// used to accept anything two characters or longer, which is how "devansh
// jaswal" and "it's.mayank" reached production.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Lowercase and drop everything a mention can't match, as the user types. */
export function cleanUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, USERNAME_MAX);
}

export function isValidUsername(username: string): boolean {
  return new RegExp(`^[a-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`).test(username);
}

/**
 * A handle the server generated, not one the person chose. Accounts from
 * before the onboarding gate (May–Sep 2026) were backfilled as onboarded with
 * these still in place: `user_<email-local>_<5 digits>` from the old
 * generator, and `user_<8–12 hex>` from handle_new_user's last-resort fallback.
 */
export function isAutoUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return /^user_[a-z0-9_]+_[0-9]{5}$/.test(username) || /^user_[0-9a-f]{8,12}$/.test(username);
}
