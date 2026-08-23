import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useActiveVideoStore } from '../store/useActiveVideoStore';

/**
 * Marks the video currently on screen as the active one.
 *
 * VideoPreview only plays while its echo is the active video, so a list that
 * renders videos without reporting viewability shows them as black frames —
 * the player mounts, never starts, and never paints. That is what the profile
 * screens were doing.
 *
 * The Flow tab and home feed each grew their own copy of this. Extracting it
 * keeps a fourth and fifth copy from appearing, and means the blur cleanup —
 * easy to forget, and the reason a video can keep playing over another
 * screen — is part of the hook rather than something each caller remembers.
 *
 * Spread the result onto a FlatList or FlashList:
 *
 *   <FlatList {...useActiveVideoTracking()} … />
 */
export function useActiveVideoTracking(threshold = 60) {
  const setActiveEchoId = useActiveVideoStore(s => s.setActiveEchoId);

  // Both lists treat these as immutable after first render and warn if the
  // identity changes between renders, so they are held in refs.
  const onViewableItemsChanged = useRef(
    // `any` deliberately: a narrower item type here leaks into FlashList's
    // generic inference at the call site and breaks its keyExtractor.
    ({ viewableItems }: { viewableItems: { item?: any }[] }) => {
      const first = viewableItems?.find(v => v?.item?.id)?.item;
      setActiveEchoId(first?.id ?? null);
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: threshold }).current;

  useFocusEffect(
    useCallback(() => {
      // Nothing to do on focus — viewability reports as soon as the list lays
      // out. On blur, release the active video so it cannot keep playing
      // underneath whatever the user opened next.
      return () => setActiveEchoId(null);
    }, [setActiveEchoId]),
  );

  return { onViewableItemsChanged, viewabilityConfig };
}
