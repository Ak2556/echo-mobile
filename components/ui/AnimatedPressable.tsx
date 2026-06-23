import React, { useEffect, useRef } from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';
import { MOTION, PRESS_DEPTH, PressDepth } from '../../lib/motion';
import { PerformanceMode, usePerformanceProfile } from '../../lib/performance';

const AnimatedPress = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  /** When set, the Pressable scales to this value on press-in. Setting any
   *  of `scaleValue`, `depth`, or `tilt3D` opts into the heavy
   *  reanimated spring path. Without them we use a cheap opacity-only
   *  feedback that costs no shared values. */
  scaleValue?: number;
  depth?: PressDepth;
  tilt3D?: boolean;

  fadeOnPress?: boolean;
  sinkOnPress?: boolean;
  dimWhenDisabled?: boolean;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  className?: string;
  style?: any;
  performanceMode?: PerformanceMode;
}

/**
 * Pressable wrapper with two modes:
 *
 * 1. **Lite (default)** — plain Pressable with opacity feedback via the
 *    `style` callback. Zero useSharedValue allocations. ~99% of call sites
 *    only want a small press-in/press-out feedback and that's all this
 *    delivers. This is the path taken when the caller omits scaleValue,
 *    depth, and tilt3D.
 *
 * 2. **Heavy** — full reanimated spring animation on scale, translateY,
 *    opacity, and optional 3D tilt. Opted into by explicitly passing
 *    `scaleValue`, `depth`, or `tilt3D`. Reserved for hero CTAs.
 *
 * Across a 20-card feed, the lite path saves ~100 worklets compared with
 * the previous always-on heavy path.
 */
export function AnimatedPressable(props: AnimatedPressableProps) {
  const isHeavy = props.scaleValue !== undefined || props.depth !== undefined || props.tilt3D === true;
  return isHeavy ? <HeavyPressable {...props} /> : <LitePressable {...props} />;
}

// Lite path
function LitePressable({
  children,
  onPress,
  fadeOnPress = false,
  dimWhenDisabled = true,
  haptic = 'light',
  style,
  disabled,
  accessibilityRole,
  accessibilityLabel,
  ...rest
}: AnimatedPressableProps) {
  const hapticEnabled = useAppStore(s => s.hapticEnabled);

  // Infer an accessibility label from a string child when the caller didn't
  // provide one. Covers the common case of `<AnimatedPressable><Text>Continue
  // </Text></AnimatedPressable>` so VoiceOver announces "Continue" without
  // needing every call site updated.
  const inferredLabel = accessibilityLabel ?? (typeof children === 'function' ? undefined : extractStringLabel(children));

  const handlePress = (e: any) => {
    if (hapticEnabled && haptic !== 'none' && !disabled) {
      const impact = haptic === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(impact);
    }
    onPress?.(e);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={inferredLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [
        {
          opacity: (disabled && dimWhenDisabled)
            ? 0.45
            : pressed
              ? (fadeOnPress ? 0.82 : 0.85)
              : 1,
        },
        typeof style === 'function' ? style({ pressed: false }) : style,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

/** Pull the first string we can find out of a React tree — best-effort. */
function extractStringLabel(node: React.ReactNode): string | undefined {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = extractStringLabel(child);
      if (found) return found;
    }
  }
  if (React.isValidElement(node)) {
    const c = (node.props as { children?: React.ReactNode }).children;
    if (c !== undefined) return extractStringLabel(c);
  }
  return undefined;
}

// Heavy path (kept for hero CTAs)
function HeavyPressable({
  children,
  onPress,
  scaleValue = 0.96,
  depth,
  fadeOnPress = false,
  sinkOnPress = true,
  dimWhenDisabled = true,
  tilt3D = false,
  haptic = 'light',
  style,
  disabled,
  performanceMode = 'default',
  accessibilityRole,
  accessibilityLabel,
  ...props
}: AnimatedPressableProps) {
  const inferredLabel = accessibilityLabel ?? (typeof children === 'function' ? undefined : extractStringLabel(children));
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(disabled && dimWhenDisabled ? 0.45 : 1);
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const performance = usePerformanceProfile(performanceMode);
  const layoutRef = useRef({ width: 1, height: 1 });

  useEffect(() => {
    opacity.value = withSpring(disabled && dimWhenDisabled ? 0.45 : 1, MOTION.settle);
  }, [disabled, dimWhenDisabled, opacity]);

  const animStyle = useAnimatedStyle(() => {
    if (tilt3D && performance.pressAnimations) {
      return {
        opacity: opacity.value,
        transform: [
          { perspective: 800 },
          { rotateX: `${rotateX.value}deg` },
          { rotateY: `${rotateY.value}deg` },
          { scale: scale.value },
          { translateY: translateY.value },
        ],
      };
    }
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }, { translateY: translateY.value }],
    };
  });

  const handlePressIn = (e: any) => {
    if (disabled) return;
    if (reduceAnimations || !performance.pressAnimations) {
      opacity.value = fadeOnPress ? 0.82 : 1;
      return;
    }
    const preset = depth ? PRESS_DEPTH[depth] : undefined;
    scale.value = withSpring(preset?.scale ?? scaleValue, preset?.spring ?? MOTION.pressFirm);
    translateY.value = withSpring(sinkOnPress ? (preset?.translateY ?? 1) : 0, preset?.spring ?? MOTION.pressFirm);
    opacity.value = withSpring(fadeOnPress ? (preset?.opacity ?? 0.9) : 1, MOTION.pressSoft);

    if (tilt3D) {
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = layoutRef.current;
      const rx = -((locationY - height / 2) / (height / 2)) * 4;
      const ry = ((locationX - width / 2) / (width / 2)) * 4;
      rotateX.value = withSpring(rx, MOTION.pressFirm);
      rotateY.value = withSpring(ry, MOTION.pressFirm);
    }
  };

  const handlePressOut = () => {
    scale.value = reduceAnimations || !performance.pressAnimations ? 1 : withSpring(1, MOTION.release);
    translateY.value = reduceAnimations || !performance.pressAnimations ? 0 : withSpring(0, MOTION.release);
    opacity.value = withSpring(disabled && dimWhenDisabled ? 0.45 : 1, MOTION.release);
    if (tilt3D && performance.pressAnimations) {
      rotateX.value = withSpring(0, MOTION.release);
      rotateY.value = withSpring(0, MOTION.release);
    }
  };

  const handlePress = (e: any) => {
    if (hapticEnabled && haptic !== 'none') {
      const impact = haptic === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(impact);
    }
    onPress?.(e);
  };

  return (
    <AnimatedPress
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLayout={(e) => {
        layoutRef.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        };
      }}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={inferredLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={[animStyle, style]}
      {...props}
    >
      {children}
    </AnimatedPress>
  );
}
