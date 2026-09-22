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

export async function isServiceCaller(token: string, keys: string[] = serviceKeys()): Promise<boolean> {
  if (!token) return false;
  let match = false;
  // No early exit: every candidate is compared, so timing does not reveal which matched.
  for (const key of keys) if (await timingSafeEqual(token, key)) match = true;
  return match;
}
