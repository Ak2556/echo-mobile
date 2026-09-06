import { useSyncExternalStore } from 'react';
import { isFeatureEnabled, subscribeToFlags } from '../lib/remoteFlags';
import type { FeatureFlag } from '../lib/featureFlags';

/**
 * Read a feature flag, re-rendering when it changes remotely.
 *
 * useSyncExternalStore rather than useState + useEffect so the value read
 * during render is never a frame behind the store. A flag flip is usually an
 * emergency, and a component that shows the old value for one more frame is
 * showing the feature you just tried to switch off.
 */
export function useFeature(flag: FeatureFlag): boolean {
  return useSyncExternalStore(
    subscribeToFlags,
    () => isFeatureEnabled(flag),
    () => isFeatureEnabled(flag),
  );
}
