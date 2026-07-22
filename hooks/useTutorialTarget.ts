import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTutorialStore } from '../store/tutorialStore';

/**
 * Registers a component as a spotlight target for the coach-mark tour.
 *
 * Attach the returned `ref` + `onLayout` to a plain View wrapping the element
 * you want highlighted:
 *
 *   const t = useTutorialTarget('home-feed');
 *   <View ref={t.ref} onLayout={t.onLayout}>…</View>
 *
 * The rect is measured in window coordinates (so the overlay can position the
 * spotlight regardless of scroll/nav chrome) and re-measured when a tour starts.
 */
export function useTutorialTarget(id: string) {
  const ref = useRef<View>(null);
  const register = useTutorialStore((s) => s.registerTarget);
  const unregister = useTutorialStore((s) => s.unregisterTarget);
  const activeTour = useTutorialStore((s) => s.activeTour);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) register(id, { x, y, width, height });
    });
  }, [id, register]);

  // Re-measure shortly after a tour begins, once layout has settled.
  useEffect(() => {
    if (!activeTour) return;
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [activeTour, measure]);

  useEffect(() => () => unregister(id), [id, unregister]);

  return { ref, onLayout: measure };
}
