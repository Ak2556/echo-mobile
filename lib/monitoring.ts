interface CaptureContext {
  tags?: Record<string, string | number | boolean>;
  extra?: Record<string, unknown>;
  userId?: string;
}

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

export function initMonitoring(): void {
  if (initialised) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const mod = loadSentry();
  if (!mod) return;
  try {
    mod.init({
      dsn,
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
    void message;
    void ctx;
    return;
  }
  mod.captureMessage(message, {
    tags: ctx?.tags,
    extra: ctx?.extra,
    user: ctx?.userId ? { id: ctx.userId } : undefined,
  });
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  const mod = loadSentry();
  if (!mod || !initialised) {
    void userId;
    void traits;
    return;
  }
  mod.setUser({ id: userId, ...(traits as Record<string, unknown>) });
}

export function clearUser(): void {
  const mod = loadSentry();
  if (!mod || !initialised) return;
  mod.setUser(null);
}
