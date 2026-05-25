/**
 * Crash + error reporting facade backed by @sentry/react-native.
 *
 * Initialisation is lazy: if EXPO_PUBLIC_SENTRY_DSN is unset we keep all
 * functions as no-ops so local dev (and Expo Go without the native module)
 * still works. Once a DSN is configured + the app is rebuilt with the
 * native module included, calls flow through to Sentry.
 *
 * Setup:
 *   1. npx expo install @sentry/react-native           (already done)
 *   2. Set EXPO_PUBLIC_SENTRY_DSN in EAS Secrets       (see README)
 *   3. Rebuild the dev client / production build       (native module added)
 */

interface CaptureContext {
  /** Optional tag map — appears as searchable tags in Sentry. */
  tags?: Record<string, string | number | boolean>;
  /** Optional structured extra data — shows under the event's "Additional Data". */
  extra?: Record<string, unknown>;
  /** Optional user id override (defaults to whatever Sentry already has via setUser). */
  userId?: string;
}

// Optional dependency — only resolved when the native module is bundled.
// The package may not be installed at all (v1 launch drops Sentry); the
// dynamic require returns null in that case and the rest of this file
// silently no-ops.
type SentryModule = any | null;

let Sentry: SentryModule = null;
let initialised = false;

function loadSentry(): SentryModule {
  if (Sentry) return Sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require('@sentry/react-native');
    return Sentry;
  } catch {
    return null;
  }
}

/**
 * Initialise Sentry. Safe to call multiple times — only the first call
 * with a valid DSN performs the underlying init.
 */
export function initMonitoring(): void {
  if (initialised) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const mod = loadSentry();
  if (!mod) return;
  try {
    mod.init({
      dsn,
      // Cut down on the verbose "you should upgrade" CI noise.
      enableNativeNagger: false,
      tracesSampleRate: 0.2,
      environment: process.env.NODE_ENV ?? 'development',
    });
    initialised = true;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[monitoring] Sentry init failed', e);
    }
  }
}

/**
 * Wrap the root React component with Sentry's error boundary + perf
 * instrumentation. No-op if Sentry isn't loaded; just returns the input.
 */
export function wrapRoot<T>(component: T): T {
  const mod = loadSentry();
  if (!mod || !initialised) return component;
  try {
    return mod.wrap(component as never) as unknown as T;
  } catch {
    return component;
  }
}

export function captureException(error: unknown, ctx?: CaptureContext): void {
  const mod = loadSentry();
  if (!mod || !initialised) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[monitoring]', error, ctx);
    }
    return;
  }
  mod.captureException(error, {
    tags: ctx?.tags,
    extra: ctx?.extra,
    user: ctx?.userId ? { id: ctx.userId } : undefined,
  });
}

export function captureMessage(message: string, ctx?: CaptureContext): void {
  const mod = loadSentry();
  if (!mod || !initialised) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[monitoring]', message, ctx);
    }
    return;
  }
  mod.captureMessage(message, {
    tags: ctx?.tags,
    extra: ctx?.extra,
    user: ctx?.userId ? { id: ctx.userId } : undefined,
  });
}

/** Tag the current user against future events. Call after sign-in. */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  const mod = loadSentry();
  if (!mod || !initialised) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[monitoring] identify', userId, traits);
    }
    return;
  }
  mod.setUser({ id: userId, ...(traits as Record<string, unknown>) });
}

/** Drop the user association on sign-out. */
export function clearUser(): void {
  const mod = loadSentry();
  if (!mod || !initialised) return;
  mod.setUser(null);
}
