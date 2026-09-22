import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";

/**
 * True when the request comes from the database itself: the moderate_new_echo
 * trigger or the resweep cron.
 *
 * Those used to prove themselves with the Vault `service_role_key`, a legacy
 * JWT. The project's legacy API keys were disabled on 2026-08-21, so the auth
 * server has rejected that key ever since; the gateway still lets it through
 * because the signature is valid, which is why the failure was a quiet 401
 * inside this function. The trigger now also sends a dedicated secret, the
 * pattern push-fanout already uses (x-push-fanout-secret): Vault holds
 * `embed_echo_secret`, the function holds EMBED_ECHO_SECRET.
 */
export async function isServiceCaller(
  provided: string | null,
  expected: string = Deno.env.get("EMBED_ECHO_SECRET") ?? "",
): Promise<boolean> {
  // An unset secret must never match an absent header.
  if (!expected || !provided) return false;
  return await timingSafeEqual(provided, expected);
}
