import React, { useEffect } from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';
import { MOTION, PRESS_DEPTH, PressDepth } from '../../lib/motion';

const AnimatedPress = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  scaleValue?: number;
  depth?: PressDepth;
  fadeOnPress?: boolean;
  sinkOnPress?: boolean;
  dimWhenDisabled?: boolean;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  className?: string;
  style?: any;
}

export function AnimatedPressable({
  children,
  onPress,
  scaleValue = 0.96,
  depth,
  fadeOnPress = false,
  sinkOnPress = true,
  dimWhenDisabled = true,
  haptic = 'light',
  style,
  disabled,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(disabled && dimWhenDisabled ? 0.45 : 1);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);

  useEffect(() => {
    opacity.value = withSpring(disabled && dimWhenDisabled ? 0.45 : 1, MOTION.settle);
  }, [disabled, dimWhenDisabled, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    if (reduceAnimations) {
      opacity.value = fadeOnPress ? 0.82 : 1;
      return;
    }
    const preset = depth ? PRESS_DEPTH[depth] : undefined;
    scale.value = withSpring(preset?.scale ?? scaleValue, preset?.spring ?? MOTION.pressFirm);
    translateY.value = withSpring(sinkOnPress ? (preset?.translateY ?? 1) : 0, preset?.spring ?? MOTION.pressFirm);
    opacity.value = withSpring(fadeOnPress ? (preset?.opacity ?? 0.9) : 1, MOTION.pressSoft);
  };

  const handlePressOut = () => {
    scale.value = reduceAnimations ? 1 : withSpring(1, MOTION.release);
    translateY.value = reduceAnimations ? 0 : withSpring(0, MOTION.release);
    opacity.value = withSpring(disabled && dimWhenDisabled ? 0.45 : 1, MOTION.release);
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
      disabled={disabled}
      style={[animStyle, style]}
      {...props}
    >
      {children}
    </AnimatedPress>
  );
}
