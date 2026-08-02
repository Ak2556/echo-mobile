import { onlineManager } from '@tanstack/react-query';

/**
 * Connectivity signal for the write layer + offline outbox.
 *
 * Drives TanStack's `onlineManager` so queries/mutations know whether the
 * device is online. Uses `@react-native-community/netinfo` when it's present in
 * the native build (guarded require so the JS still runs in a dev-client that
 * predates the module); otherwise it assumes online and relies on request
 * failures + the outbox's retry loop.
 *
 * A manual override (`setForcedOffline`) exists for development/testing so we
 * can exercise the offline → replay path without touching real connectivity.
 */

let netinfoUnsubscribe: (() => void) | null = null;
let forcedOffline = false;
let lastRealOnline = true;

function apply() {
  onlineManager.setOnline(forcedOffline ? false : lastRealOnline);
}

export function initOnlineManager(): void {
  // Guarded require: the native module may be absent (dev-client that predates
  // it). Typed as any so the app compiles/runs without the dependency.
  let NetInfo: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NetInfo = require('@react-native-community/netinfo').default;
  } catch {
    NetInfo = null;
  }

  if (NetInfo) {
    netinfoUnsubscribe?.();
    netinfoUnsubscribe = NetInfo.addEventListener((state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
      lastRealOnline = state.isConnected !== false && state.isInternetReachable !== false;
      apply();
    });
  } else {
    lastRealOnline = true;
    apply();
  }
}

/** True when the app should attempt network writes right now. */
export function isAppOnline(): boolean {
  return onlineManager.isOnline();
}

/** Dev/testing: force the app to behave as offline (queues writes) or clear it. */
export function setForcedOffline(v: boolean): void {
  forcedOffline = v;
  apply();
}

export function isForcedOffline(): boolean {
  return forcedOffline;
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Bound a network write so a *stalled* connection (socket open, no response)
 * can't hang the UI forever. On timeout the promise rejects with a TimeoutError
 * so the caller can surface a "failed — retry" state instead of an eternal
 * spinner. Note: this does not cancel the underlying request (it may still land
 * server-side), so only auto-retry writes that are idempotent.
 */
export function withTimeout<T>(promise: Promise<T>, ms = 20000, label = 'request'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(`Timed out after ${Math.round(ms / 1000)}s — ${label}`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
