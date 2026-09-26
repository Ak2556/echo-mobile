import { useCallback, useId, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { clearVoiceActions, registerVoiceActions, type VoiceActionHandlers } from './actions';

/**
 * Register a screen's voice actions for exactly as long as it is focused.
 *
 * Separate from actions.ts so that module stays dependency-free: the dispatcher
 * imports the registry, and pulling React and expo-router in behind it would put
 * the router in the dependency graph of every test that touches voice
 * dispatching. Screens need the hook; the dispatcher needs the map.
 *
 * One line per screen, with the focus lifecycle handled here so a screen cannot
 * get it wrong the way home.tsx did — it registered in `useEffect(..., [])`, and
 * tab screens do not unmount, so its handlers stayed live while the user was
 * looking at another tab.
 *
 * Handlers are read through a ref, so a screen may pass fresh closures on every
 * render without re-registering and without the dispatcher calling a stale one.
 */
export function useVoiceScreenActions(handlers: VoiceActionHandlers): void {
  const owner = useId();
  const latest = useRef(handlers);
  latest.current = handlers;

  useFocusEffect(
    useCallback(() => {
      registerVoiceActions(owner, {
        postAction: (action) => latest.current.postAction?.(action) ?? false,
        composeText: (text) => latest.current.composeText?.(text) ?? false,
        scroll: (dir) => latest.current.scroll?.(dir),
        refresh: () => latest.current.refresh?.(),
      });
      return () => clearVoiceActions(owner);
    }, [owner]),
  );
}
