const AUTH_TIMEOUT_MS = 15_000;

export const AUTH_TIMEOUT_MESSAGE =
  'Authentication timed out. Check your connection and try again.';

/**
 * Cap an auth call, and report the timeout the same way the call itself would.
 *
 * This used to `reject` on timeout, which quietly broke the contract every
 * caller is written against. `supabase.auth.*` resolves to `{ data, error }`,
 * every provider in this folder is typed `Promise<ProviderResult>` and returns
 * `{ error }`, and the screens destructure that. A rejection skips all of it.
 *
 * What that cost, concretely: `app/auth/login.tsx` has no try/catch anywhere in
 * the file. `handleGoogle` and `handleApple` set their loading flag, await the
 * provider, and clear the flag afterwards. A timeout therefore aborted the
 * handler *before* the flag was cleared — the spinner ran forever, no toast, no
 * log, and the `if (googleLoading) return` guard at the top meant the button
 * stayed dead until the app was restarted. `refreshAuthSession()` was a second
 * route into the identical state. Both are the primary sign-in paths, and a
 * 15-second call is reachable on a slow connection to a distant region.
 *
 * So: resolve with an error-shaped result instead. The value carries the union
 * of the `data` shapes the call sites destructure — `{ session }` in
 * lib/auth/listener.ts, `{ data, error }` in providers/google.ts, bare
 * `{ error }` everywhere else — so none of them throw on a missing field. The
 * message is matched by `friendlyAuthError`, which turns it into "That took too
 * long. Check your connection and try again."
 *
 * The cast is the honest part of this: `T` is whichever `{ data, error }` shape
 * the wrapped Supabase method returns, and there is no way to synthesise a real
 * one generically. Callers only ever read `data.session`, `data`, or `error`,
 * and all three are present.
 */
export function withAuthTimeout<T>(
  operation: Promise<T>,
  message = AUTH_TIMEOUT_MESSAGE,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        data: { session: null, user: null, url: null, provider: null },
        // Shaped like an AuthError rather than constructed as one: importing
        // the class here would pull @supabase/auth-js into the launch path,
        // and every consumer reads `.message` only.
        error: { name: 'AuthRetryableFetchError', message, status: 0 },
      } as unknown as T);
    }, AUTH_TIMEOUT_MS);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
