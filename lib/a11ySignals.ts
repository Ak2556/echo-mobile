import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The operating system's accessibility settings.
 *
 * Until now nothing in the app read these: `AccessibilityInfo` appeared nowhere in
 * the codebase, so someone who had turned on Reduce Motion or Reduce Transparency
 * system-wide still got the full animated, translucent interface. The toggles in
 * Settings were the only ones that worked, which is the wrong way round — a
 * preference set for the whole device should not have to be found again here.
 *
 * Deliberately a module-level singleton read through `useSyncExternalStore` rather
 * than a per-component effect. `usePerformanceProfile` consumes this, and that runs
 * once per feed row while scrolling; a subscription per card would mean dozens of
 * duplicate listeners for one process-wide value.
 *
 * Every query is wrapped: not all of these exist everywhere (Reduce Transparency is
 * iOS-only, react-native-web implements a subset), and a missing one must read as
 * "not enabled" rather than throw on the launch path.
 */

export interface A11ySignals {
  /** OS "Reduce Motion". Suppresses springs, parallax and kinetic type. */
  reduceMotion: boolean;
  /** OS "Reduce Transparency" (iOS). Forces glass surfaces to solid fills. */
  reduceTransparency: boolean;
  /** VoiceOver / TalkBack is running. Gesture-only affordances need equivalents. */
  screenReaderEnabled: boolean;
}

export const NO_A11Y_SIGNALS: A11ySignals = Object.freeze({
  reduceMotion: false,
  reduceTransparency: false,
  screenReaderEnabled: false,
});

type Query = () => Promise<boolean>;

async function safely(query: Query | undefined): Promise<boolean> {
  if (typeof query !== 'function') return false;
  try {
    return Boolean(await query());
  } catch {
    return false;
  }
}

let snapshot: A11ySignals = NO_A11Y_SIGNALS;
const listeners = new Set<() => void>();
let started = false;
let stopEvents: Array<() => void> = [];

function publish(next: Partial<A11ySignals>): void {
  const merged = { ...snapshot, ...next };
  const changed = (Object.keys(merged) as Array<keyof A11ySignals>).some(
    k => merged[k] !== snapshot[k],
  );
  // Identity must stay stable when nothing moved, or every subscriber re-renders.
  if (!changed) return;
  snapshot = merged;
  listeners.forEach(fn => fn());
}

function listen(event: string, key: keyof A11ySignals): () => void {
  try {
    const sub = AccessibilityInfo.addEventListener(
      event as Parameters<typeof AccessibilityInfo.addEventListener>[0],
      ((value: boolean) => publish({ [key]: Boolean(value) })) as never,
    );
    return () => {
      try {
        sub?.remove();
      } catch {
        // Nothing to release.
      }
    };
  } catch {
    // Platform does not emit this event.
    return () => {};
  }
}

function start(): void {
  if (started) return;
  started = true;

  void (async () => {
    const [reduceMotion, reduceTransparency, screenReaderEnabled] = await Promise.all([
      safely(AccessibilityInfo.isReduceMotionEnabled),
      safely(
        (AccessibilityInfo as { isReduceTransparencyEnabled?: Query }).isReduceTransparencyEnabled,
      ),
      safely(AccessibilityInfo.isScreenReaderEnabled),
    ]);
    publish({ reduceMotion, reduceTransparency, screenReaderEnabled });
  })();

  stopEvents = [
    listen('reduceMotionChanged', 'reduceMotion'),
    listen('reduceTransparencyChanged', 'reduceTransparency'),
    listen('screenReaderChanged', 'screenReaderEnabled'),
  ];
}

function subscribe(onChange: () => void): () => void {
  start();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): A11ySignals {
  return snapshot;
}

/** Server/static-render snapshot: assume nothing is enabled. */
function getServerSnapshot(): A11ySignals {
  return NO_A11Y_SIGNALS;
}

export function useA11ySignals(): A11ySignals {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Non-reactive read, for code outside the React tree. */
export function readA11ySignals(): A11ySignals {
  start();
  return snapshot;
}

/** Test seam: drop listeners and reset to the default snapshot. */
export function resetA11ySignals(): void {
  stopEvents.forEach(off => off());
  stopEvents = [];
  listeners.clear();
  snapshot = NO_A11Y_SIGNALS;
  started = false;
}
