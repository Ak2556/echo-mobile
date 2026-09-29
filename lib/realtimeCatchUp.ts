/**
 * Realtime delivers changes while a channel is joined and never replays what
 * happened while it was not. A phone that locks, a socket that drops, or the
 * gap between a screen's first fetch and its channel joining all lose events,
 * and nothing else refetches a DM thread: refetchOnWindowFocus is off and the
 * cache is fresh for 30 s. The missing message stays missing until some later
 * event happens to trigger a refetch.
 *
 * So every DM subscription catches up by refetching:
 *  - each time its channel reports SUBSCRIBED (first join, and every rejoin
 *    after a reconnect), and
 *  - as soon as the app returns from the background, which is quicker than
 *    waiting for the heartbeat to notice the dead socket and rejoin.
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Channel status callback: refetch whenever the channel (re)joins. */
export function catchUpOnJoin(catchUp: () => void): (status: string) => void {
  return status => {
    if (status === 'SUBSCRIBED') catchUp();
  };
}

/**
 * A return from the background, not an inactive blip. iOS goes
 * inactive → active for the Face ID prompt or a system sheet without the app
 * ever being suspended; nothing can have been missed then.
 */
export function isResumeFromBackground(prev: AppStateStatus, next: AppStateStatus): boolean {
  return prev === 'background' && next === 'active';
}

/** Refetch when the app comes back from the background. */
export function useCatchUpOnResume(catchUp: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', next => {
      if (isResumeFromBackground(prev, next)) catchUp();
      prev = next;
    });
    return () => sub.remove();
  }, [catchUp, enabled]);
}
