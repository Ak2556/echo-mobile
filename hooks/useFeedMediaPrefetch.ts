import { useCallback, useRef } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { isAppOnline } from '../lib/core/net';
import { loadVideoPoster } from '../lib/media/videoPoster';
import { planMediaPrefetch, type PrefetchItem } from '../lib/media/prefetchPlan';
import { useAppStore } from '../store/useAppStore';

/** Enough to remember what is on its way, without growing for the life of the app. */
const MAX_REMEMBERED = 400;

/**
 * Start loading the media of the cards just below the one on screen.
 *
 * Call with the cards that follow the current one. It does nothing offline or
 * under Data Saver, where fetching ahead is exactly the spending the person
 * switched off. Best effort throughout: a prefetch that fails costs nothing but
 * the head start.
 */
export function useFeedMediaPrefetch() {
  const seen = useRef(new Set<string>()).current;

  return useCallback((following: readonly PrefetchItem[]) => {
    if (useAppStore.getState().dataSaver || !isAppOnline()) return;

    const plan = planMediaPrefetch(following, -1, seen);
    for (const uri of [...plan.images, ...plan.videos]) seen.add(uri);
    if (seen.size > MAX_REMEMBERED) seen.clear();

    if (plan.images.length) void ExpoImage.prefetch(plan.images, 'memory-disk').catch(() => undefined);
    for (const uri of plan.videos) void loadVideoPoster(uri);
  }, [seen]);
}
