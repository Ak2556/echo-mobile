import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  type ViewStyle,
  type AccessibilityActionEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceProfile } from '../../src/shared/lib/performance';
import { MOTION } from '../../lib/motion';
import { resist, decideSwipe, DEFAULT_SWIPE, type SwipeOutcome } from './gestureCardSwipe';
import { buildActions, dispatch, type GestureCardAction } from './gestureCardA11y';

/**
 * A card driven by gesture rather than by a row of buttons.
 *
 * Swipe right, swipe left, double-tap and long-press each carry an action, and
 * the visible chrome shrinks accordingly. The rule this component exists to
 * enforce is that **every gesture also has a non-gesture route**: each one is
 * published as an `accessibilityAction`, so VoiceOver and TalkBack users reach
 * the same actions through the rotor. A gesture-only affordance is invisible to
 * a screen reader, and for a product with reporting and blocking duties that is
 * not a trade worth making.
 *
 * Two things that are easy to get wrong and are handled here:
 *
 *   The pan must not steal vertical scrolling. It activates only after clear
 *   horizontal intent and fails outright on vertical movement, so a feed still
 *   scrolls normally.
 *
 *   The view inside a GestureDetector must not be flattened. Its styles here are
 *   pure layout, so React Native's optimiser would remove it and take the
 *   gesture target with it — the same failure documented in Slider.tsx. Hence
 *   collapsable={false}.
 */

export type { GestureCardAction };

export interface GestureCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  swipeRight?: GestureCardAction;
  swipeLeft?: GestureCardAction;
  doubleTap?: GestureCardAction;
  longPress?: GestureCardAction;
  /** Revealed behind the card as it slides right. */
  revealRight?: React.ReactNode;
  /** Revealed behind the card as it slides left. */
  revealLeft?: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function GestureCard({
  children,
  onPress,
  swipeRight,
  swipeLeft,
  doubleTap,
  longPress,
  revealRight,
  revealLeft,
  style,
  disabled = false,
  accessibilityLabel,
}: GestureCardProps) {
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { reduceMotion } = usePerformanceProfile('hot');

  const dx = useSharedValue(0);
  const armed = useSharedValue(0); // 1 once past the commit threshold

  const fire = useCallback(
    (action?: GestureCardAction) => {
      if (!action) return;
      if (hapticEnabled) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      action.run();
    },
    [hapticEnabled],
  );

  const commit = useCallback(
    (outcome: SwipeOutcome) => {
      if (outcome === 'right') fire(swipeRight);
      else if (outcome === 'left') fire(swipeLeft);
    },
    [fire, swipeRight, swipeLeft],
  );

  const tick = useCallback(() => {
    if (hapticEnabled) {
      void Haptics.selectionAsync().catch(() => {});
    }
  }, [hapticEnabled]);

  const canSwipe = !disabled && (!!swipeRight || !!swipeLeft);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canSwipe)
        // Horizontal intent only. Without both of these the card competes with
        // the list it lives in and vertical scrolling becomes unreliable.
        .activeOffsetX([-14, 14])
        .failOffsetY([-10, 10])
        .onUpdate(e => {
          'worklet';
          // Ignore a direction that has nothing bound to it.
          const allowed =
            (e.translationX > 0 && swipeRight != null) ||
            (e.translationX < 0 && swipeLeft != null);
          dx.value = allowed ? resist(e.translationX, DEFAULT_SWIPE) : 0;

          const past = Math.abs(e.translationX) >= DEFAULT_SWIPE.threshold ? 1 : 0;
          // One tick at the moment it becomes committable, not every frame.
          if (past !== armed.value) {
            armed.value = past;
            if (past) runOnJS(tick)();
          }
        })
        .onEnd(e => {
          'worklet';
          const outcome = decideSwipe(e.translationX, e.velocityX, DEFAULT_SWIPE);
          const bound =
            (outcome === 'right' && swipeRight != null) ||
            (outcome === 'left' && swipeLeft != null);
          if (bound) runOnJS(commit)(outcome);
          armed.value = 0;
          dx.value = withSpring(0, MOTION.snap);
        })
        .onFinalize(() => {
          'worklet';
          armed.value = 0;
          dx.value = withSpring(0, MOTION.settle);
        }),
    [canSwipe, swipeRight, swipeLeft, commit, tick, dx, armed],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(!disabled && !!doubleTap)
        .numberOfTaps(2)
        .maxDuration(260)
        .onEnd((_e, success) => {
          'worklet';
          if (success) runOnJS(fire)(doubleTap);
        }),
    [disabled, doubleTap, fire],
  );

  const singleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(!disabled && !!onPress)
        .numberOfTaps(1)
        .onEnd((_e, success) => {
          'worklet';
          if (success && onPress) runOnJS(onPress)();
        }),
    [disabled, onPress],
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(!disabled && !!longPress)
        .minDuration(320)
        .onStart(() => {
          'worklet';
          runOnJS(fire)(longPress);
        }),
    [disabled, longPress, fire],
  );

  const composed = useMemo(
    () =>
      Gesture.Simultaneous(
        pan,
        // A double tap must get the chance to beat a single tap, and a long
        // press must beat both.
        Gesture.Exclusive(longPressGesture, doubleTapGesture, singleTapGesture),
      ),
    [pan, longPressGesture, doubleTapGesture, singleTapGesture],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduceMotion ? 0 : dx.value }],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.value, [0, DEFAULT_SWIPE.threshold], [0, 1], Extrapolation.CLAMP),
  }));

  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.value, [-DEFAULT_SWIPE.threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));

  // Every gesture, republished where a screen reader can find it. The building
  // and dispatching live in ./gestureCardA11y so the parity is unit-tested.
  const candidates = useMemo(
    () => [swipeRight, swipeLeft, doubleTap, longPress],
    [swipeRight, swipeLeft, doubleTap, longPress],
  );
  const a11yActions = useMemo(() => buildActions(candidates), [candidates]);
  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      dispatch(e.nativeEvent.actionName, candidates);
    },
    [candidates],
  );

  return (
    <View style={[styles.host, style]}>
      {revealRight ? (
        <Animated.View style={[styles.reveal, styles.revealRight, rightStyle]} pointerEvents="none">
          {revealRight}
        </Animated.View>
      ) : null}
      {revealLeft ? (
        <Animated.View style={[styles.reveal, styles.revealLeft, leftStyle]} pointerEvents="none">
          {revealLeft}
        </Animated.View>
      ) : null}

      <GestureDetector gesture={composed}>
        {/* collapsable={false}: these styles are pure layout, so RN would flatten
            this view away and the gesture would lose its target. */}
        <Animated.View
          collapsable={false}
          style={cardStyle}
          accessible={false}
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={a11yActions.length ? a11yActions : undefined}
          onAccessibilityAction={a11yActions.length ? onAccessibilityAction : undefined}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'relative' },
  reveal: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  revealRight: { alignItems: 'flex-start', paddingLeft: 22 },
  revealLeft: { alignItems: 'flex-end', paddingRight: 22 },
});
