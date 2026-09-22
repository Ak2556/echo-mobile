import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";

/**
 * Keys that identify the database itself (trigger, cron) as the caller.
 *
 * The Vault `service_role_key` the trigger sends may be the legacy JWT or one
 * of the newer `sb_secret_…` keys, so both env forms are accepted.
 * SUPABASE_SECRET_KEYS arrives as JSON (an object or array of keys) or as a
 * bare string, depending on platform version.
 */
export function serviceKeys(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): string[] {
  const keys: string[] = [];
  const legacy = get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) keys.push(legacy);
  const raw = get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed ? Object.values(parsed) : [parsed];
      for (const v of values) if (typeof v === "string" && v) keys.push(v);
    } catch {
      keys.push(raw);
    }
  }
  return keys;
}

/** The `role` claim of a JWT, unverified. Only a hint for which check to run. */
export function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const role = JSON.parse(json)?.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * True when the token is this project's service key.
 *
 * Exact match against the keys in env is the fast path. It is not enough on
 * its own: the Vault copy the trigger sends and the env copy the function
 * holds can be different valid service keys (the platform re-issues the env
 * copies), and that mismatch made every server call a 401. So a token that
 * claims the service role is put to the auth server's admin API, which only a
 * genuine service key can read. The claim itself is never trusted.
 */
export async function isServiceCaller(
  token: string,
  keys: string[] = serviceKeys(),
  authUrl: string = Deno.env.get("SUPABASE_URL") ?? "",
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  let match = false;
  // No early exit: every candidate is compared, so timing does not reveal which matched.
  for (const key of keys) if (await timingSafeEqual(token, key)) match = true;
  if (match) return true;

  if (jwtRole(token) !== "service_role" || !authUrl) return false;
  try {
    const res = await fetchImpl(`${authUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: token, Authorization: `Bearer ${token}` },
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}
