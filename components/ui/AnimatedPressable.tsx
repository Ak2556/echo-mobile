import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';

const AnimatedPress = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  scaleValue?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  className?: string;
  style?: any;
}

export function AnimatedPressable({
  children,
  onPress,
  scaleValue = 0.96,
  haptic = 'light',
  style,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(scaleValue, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
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
      style={[animStyle, style]}
      {...props}
    >
      {children}
    </AnimatedPress>
  );
}
