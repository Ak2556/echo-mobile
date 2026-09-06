/**
 * Remote overrides for lib/featureFlags.ts — the kill switch.
 *
 * The compiled map stays the DEFAULT and this is a layer on top. That ordering
 * is the whole safety property: an unreachable database, a corrupt cache, or a
 * flag with no row all resolve to what shipped. Treating the table as the
 * source of truth instead would turn one bad network into an app with no
 * features, which is a worse outage than the one the kill switch exists to end.
 *
 * Reads are synchronous because app/(tabs)/you.tsx builds its menu from flags
 * during render. The cache is hydrated from the same sync storage the Zustand
 * store uses, so a cold start already has the last known values and the network
 * refresh only matters from the second launch onward.
 */
import { FLAGS, type FeatureFlag } from './featureFlags';
import { storage } from '../store/persist';
import { supabase } from './supabase';

const CACHE_KEY = 'echo:remoteFlags';

let overrides: Partial<Record<FeatureFlag, boolean>> = {};
const listeners = new Set<() => void>();

function isKnownFlag(key: string): key is FeatureFlag {
  return Object.prototype.hasOwnProperty.call(FLAGS, key);
}

function hydrate(): void {
  overrides = {};
  let raw: string | undefined;
  try {
    raw = storage.getString(CACHE_KEY);
  } catch {
    return; // storage unavailable — compiled defaults are correct
  }
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      // Unknown keys and non-booleans are dropped rather than trusted: this
      // cache is the one input an attacker with device access could edit.
      if (isKnownFlag(key) && typeof value === 'boolean') overrides[key] = value;
    }
  } catch {
    try { storage.delete(CACHE_KEY); } catch { /* best effort */ }
  }
}

hydrate();

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const override = overrides[flag];
  return typeof override === 'boolean' ? override : FLAGS[flag];
}

export function subscribeToFlags(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function refreshRemoteFlags(): Promise<void> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.from('feature_flags').select('key, enabled'));
  } catch (e) {
    error = e;
  }

  // Any failure keeps the last good values. Clearing them on a transient error
  // would change the app's shape whenever the user's train enters a tunnel.
  if (error || !Array.isArray(data)) return;

  const next: Partial<Record<FeatureFlag, boolean>> = {};
  for (const row of data as Array<{ key?: unknown; enabled?: unknown }>) {
    if (typeof row?.key === 'string' && isKnownFlag(row.key) && typeof row.enabled === 'boolean') {
      next[row.key] = row.enabled;
    }
  }

  const changed = (Object.keys(FLAGS) as FeatureFlag[])
    .some(k => (next[k] ?? FLAGS[k]) !== (overrides[k] ?? FLAGS[k]));

  overrides = next;
  try { storage.set(CACHE_KEY, JSON.stringify(next)); } catch { /* best effort */ }
  if (changed) for (const fn of [...listeners]) fn();
}

/** Test seam: re-read the cache and drop subscribers. */
export function __resetFlagsForTest(): void {
  listeners.clear();
  hydrate();
}
