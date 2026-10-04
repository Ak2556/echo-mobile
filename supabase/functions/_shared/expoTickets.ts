// Pure helpers for Expo push: which tokens to send to, and what the tickets say.
//
// No Deno or URL imports, so vitest runs the tests beside it and every edge
// function that pushes can share one reading of Expo's answer. Expo replies
// HTTP 200 with one ticket per message, in order, and each ticket carries its
// own status. Treating the HTTP status as the outcome is how a dead FCM
// credential once looked like success for weeks (see push-fanout).

/** Expo tokens look like ExponentPushToken[...] or ExpoPushToken[...]. */
export const EXPO_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

/** Expo's documented maximum messages per send request. */
export const EXPO_MAX_PER_REQUEST = 100;

export interface ExpoTicket {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Every device a user can be reached on. `push_tokens` is the real store, one
 * row per device; installs older than it still write only the legacy
 * `profiles.push_token`, so that is included until those installs are gone.
 *
 * `skipIos` drops iOS devices: Expo has no APNs credentials for the app, so
 * every send to one comes back InvalidCredentials, and each daily broadcast
 * then filed a "reached 20 of 21 devices" report that paged the owner every
 * three hours. It is not a general InvalidCredentials filter on purpose: that
 * error from an Android token is a dead FCM credential, which once looked like
 * success for weeks and must stay loud. A legacy token is dropped too when it
 * is the same device as a skipped one.
 */
export function deviceTokens(
  rows: { token: string | null; platform?: string | null }[],
  legacy: string | null | undefined,
  opts: { skipIos?: boolean } = {},
): string[] {
  const skipped = new Set(
    opts.skipIos ? rows.filter((r) => r.platform === 'ios').map((r) => r.token) : [],
  );
  const kept = rows.filter((r) => !skipped.has(r.token)).map((r) => r.token);
  const all = [...kept, legacy && skipped.has(legacy) ? null : legacy];
  return [...new Set(all.filter((t): t is string => typeof t === 'string' && EXPO_TOKEN.test(t)))];
}

export interface TicketOutcome {
  /** Accepted by Expo for delivery. Receipts come later, keyed by ticket id. */
  accepted: { token: string; ticketId: string }[];
  /** Uninstalled or rotated: remove these tokens, a retry cannot help. */
  dead: string[];
  /** Anything else: a credential, payload or sender problem worth alerting on. */
  fatal: { token: string; error: string }[];
}

/** Tickets arrive in the order the messages were sent. */
export function classifyTickets(tokens: string[], tickets: ExpoTicket[]): TicketOutcome {
  const out: TicketOutcome = { accepted: [], dead: [], fatal: [] };
  tokens.forEach((token, i) => {
    const t = tickets[i];
    if (!t) {
      out.fatal.push({ token, error: 'no ticket' });
    } else if (t.status === 'ok') {
      if (t.id) out.accepted.push({ token, ticketId: t.id });
    } else if (t.details?.error === 'DeviceNotRegistered') {
      out.dead.push(token);
    } else {
      out.fatal.push({ token, error: `${t.details?.error ?? 'unknown'}: ${t.message ?? ''}`.trim() });
    }
  });
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
