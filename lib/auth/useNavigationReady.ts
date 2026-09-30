import { useEffect, useState } from 'react';

/**
 * Whether the root navigation container is mounted and ready — the exact
 * condition expo-router checks before it lets anything navigate
 * (router-store `assertIsReady`: `navigationRef.isReady()`).
 *
 * The routing effect in AuthListenerProvider used to gate on
 * `useRootNavigationState()?.key`. That state lives in expo-router's
 * module-level store, which outlives the React tree: when Android recreates
 * the activity inside a live process (a system theme/overlay change, a
 * locale or font-size change), the new tree mounts with the previous key
 * still set, the guard passes before the new container exists, and
 * `router.replace` throws "Attempted to navigate before mounting the Root
 * Layout component" (seen 2026-09-30 on the release APK).
 *
 * The container ref reports `isReady() === false` while no container is
 * attached, buffers listeners until one attaches, and each container emits
 * 'ready' once. So: start from `isReady()`, flip on 'ready' (or on the first
 * 'state' event, in case 'ready' fired before this subscribed).
 */
export type ReadinessRef = {
  isReady(): boolean;
  addListener(event: 'ready' | 'state', callback: () => void): () => void;
};

export function useNavigationReady(navigationRef: ReadinessRef): boolean {
  const [ready, setReady] = useState(() => navigationRef.isReady());

  useEffect(() => {
    const check = () => {
      if (navigationRef.isReady()) setReady(true);
    };
    check();
    const offReady = navigationRef.addListener('ready', check);
    const offState = navigationRef.addListener('state', check);
    return () => {
      offReady();
      offState();
    };
  }, [navigationRef]);

  return ready;
}
