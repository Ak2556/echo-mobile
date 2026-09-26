import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * A scrollable list that voice can move by a screenful.
 *
 * "Scroll down" should advance a page, the way a thumb does. The one screen
 * that implemented it sent the list to offset 100000 — the end — which is a
 * reasonable shortcut to write and a poor thing to do to someone who cannot see
 * the scrollbar: they say "scroll down" once and lose their place entirely,
 * with no way to describe where they landed.
 *
 * Tracking the offset is what makes a page-wise move possible, since neither
 * FlatList, FlashList nor ScrollView will tell you where they are. The screen
 * spreads `onScroll` and `onLayout` onto its list and hands `scroll` to
 * useVoiceScreenActions.
 *
 * Works with either API: FlatList and FlashList expose scrollToOffset, plain
 * ScrollView exposes scrollTo, and a screen should not have to care which one
 * it happens to be rendering.
 */
export function useVoiceScrollTarget<T = unknown>() {
  const ref = useRef<T | null>(null);
  const offset = useRef(0);
  const viewport = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewport.current = e.nativeEvent.layout.height;
  }, []);

  const scroll = useCallback((dir: 'up' | 'down') => {
    // A little less than a full screen, so the line you were reading is still
    // on the page afterwards and you can tell the list moved rather than jumped.
    const page = (viewport.current || 600) * 0.85;
    const next = Math.max(0, offset.current + (dir === 'down' ? page : -page));
    const node = ref.current as {
      scrollToOffset?: (o: { offset: number; animated?: boolean }) => void;
      scrollTo?: (o: { y: number; animated?: boolean }) => void;
    } | null;
    try {
      if (typeof node?.scrollToOffset === 'function') node.scrollToOffset({ offset: next, animated: true });
      else if (typeof node?.scrollTo === 'function') node.scrollTo({ y: next, animated: true });
      else return;
    } catch {
      // A list that is unmounting mid-command is not an error worth surfacing.
      return;
    }
    // Recorded optimistically: onScroll fires asynchronously, and two quick
    // "scroll down"s should advance two pages rather than the same one twice.
    offset.current = next;
  }, []);

  return { ref, onScroll, onLayout, scroll };
}
