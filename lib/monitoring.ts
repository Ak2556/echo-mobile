/**
 * Crash + error reporting facade.
 *
 * For v1 launch we ship this as a no-op stub so the call sites are correct
 * but the bundle stays small. Before submitting to the App Store, install:
 *
 *   npx expo install @sentry/react-native
 *
 * Then replace the body of `captureException` and `captureMessage` with
 *
 *   import * as Sentry from '@sentry/react-native';
 *   Sentry.captureException(error, ctx);
 *
 * And in app/_layout.tsx, call `Sentry.init({ dsn: …, tracesSampleRate: 0.1 })`
 * once before the QueryClientProvider mounts. The DSN goes in EAS env
 * vars (eas.json → build.production.env.SENTRY_DSN).
 */

interface CaptureContext {
  /** Optional tag map — appears as searchable tags in Sentry. */
  tags?: Record<string, string | number | boolean>;
  /** Optional structured extra data — shows under the event's "Additional Data". */
  extra?: Record<string, unknown>;
  /** Optional user id override (defaults to whatever Sentry already has via setUser). */
  userId?: string;
}

/** Whether a real backend is wired up. Until then, we log to the console. */
const ENABLED = false;

export function captureException(error: unknown, ctx?: CaptureContext): void {
  if (!ENABLED) {
    // Keep a console.error fallback in development so we don't lose signal
    // until Sentry is wired up. The fallback is silenced in production
    // builds via __DEV__.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[monitoring]', error, ctx);
    }
    return;
  }
  // Sentry integration goes here once installed.
}

export function captureMessage(message: string, ctx?: CaptureContext): void {
  if (!ENABLED) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[monitoring]', message, ctx);
    }
    return;
  }
}

/** Tag the current user against future events. Call after sign-in. */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (!ENABLED) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[monitoring] identify', userId, traits);
    }
    return;
  }
}

/** Drop the user association on sign-out. */
export function clearUser(): void {
  if (!ENABLED) return;
}
