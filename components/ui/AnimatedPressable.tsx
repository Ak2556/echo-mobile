import React, { useEffect, useRef } from 'react';
import { Pressable, PressableProps, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';
import { MOTION, PRESS_DEPTH, PressDepth } from '../../lib/motion';
import { PerformanceMode, usePerformanceProfile } from '../../lib/performance';

const AnimatedPress = Animated.createAnimatedComponent(Pressable);

// ---------------------------------------------------------------------------
// Layout-drop hardening
//
// Box/decoration style props (backgroundColor, border*, borderRadius, padding,
// flexDirection, gap, alignItems, overflow, …) placed directly on a Pressable
// have repeatedly collapsed in Release builds — the recurring "layout-drop"
// bug. The only reliably-safe pattern is to render those props on a plain inner
// `View` and keep only press feedback + layout participation on the touchable.
//
// AnimatedPressable now does that split automatically: any caller `style` is
// flattened and partitioned into
//   • OUTER — props that must stay on the touchable so it participates in the
//     parent's layout the same way it does today (margin, flex, sizing,
//     absolute positioning). These never drop.
//   • INNER — everything else (the box), which is applied to an auto-inserted
//     inner View that fills the touchable (`flex: 1`).
// When a caller passes no box props (pure layout, e.g. just a margin) we skip
// the wrapper entirely and behave exactly as before.
const OUTER_STYLE_KEYS = new Set<string>([
  // flex participation in the parent
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  // sizing
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'aspectRatio',
  // margins
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  // absolute positioning
  'position', 'top', 'right', 'bottom', 'left', 'start', 'end', 'zIndex',
  // display toggle
  'display',
]);

function partitionStyle(resolved: any): { outer: Record<string, any>; inner: Record<string, any>; hasBox: boolean } {
  const flat = (StyleSheet.flatten(resolved) as Record<string, any>) || {};
  const outer: Record<string, any> = {};
  const inner: Record<string, any> = {};
  for (const key in flat) {
    if (OUTER_STYLE_KEYS.has(key)) outer[key] = flat[key];
    else inner[key] = flat[key];
  }
  return { outer, inner, hasBox: Object.keys(inner).length > 0 };
}

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

  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  const { outer, inner, hasBox } = partitionStyle(resolved);
  const pressOpacity = (pressed: boolean) =>
    (disabled && dimWhenDisabled) ? 0.45 : pressed ? (fadeOnPress ? 0.82 : 0.85) : 1;

  // Box present → put the box on a plain inner View that fills the touchable;
  // the Pressable keeps only layout participation + press feedback. Function
  // children can't be wrapped in a View, so they keep the flat-object path.
  if (hasBox && typeof children !== 'function') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={inferredLabel}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={({ pressed }) => ({ ...outer, opacity: pressOpacity(pressed) })}
        {...rest}
      >
        <View style={[inner, styles.fill]}>{children}</View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={inferredLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      // Flatten to a single object: function styles returning ARRAYS have
      // dropped layout props (flexDirection/width/gap) in Release builds —
      // see the ActionSheet regression note. A flat merged object survives.
      style={({ pressed }) => StyleSheet.flatten([resolved, { opacity: pressOpacity(pressed) }])}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

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

  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  const { outer, inner, hasBox } = partitionStyle(resolved);
  const onLayout = (e: any) => {
    layoutRef.current = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
  };

  // Same layout-drop hardening as the lite path: the box goes on a plain inner
  // View, only transforms/opacity (animStyle) + layout participation (outer)
  // ride on the animated touchable.
  if (hasBox && typeof children !== 'function') {
    return (
      <AnimatedPress
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLayout={onLayout}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={inferredLabel}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={[outer, animStyle]}
        {...props}
      >
        <View style={[inner, styles.fill]}>{children}</View>
      </AnimatedPress>
    );
  }

  return (
    <AnimatedPress
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLayout={onLayout}
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
