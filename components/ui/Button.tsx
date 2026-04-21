import React from 'react';
import { Pressable, Text, PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ label, variant = 'primary', ...props }: ButtonProps) {
  const { colors, radius, reduceAnimations } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!reduceAnimations) {
      scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
    }
  };

  const handlePressOut = () => {
    if (!reduceAnimations) {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    }
  };

  const bgColor = {
    primary: colors.accent,
    secondary: colors.surface,
    ghost: 'transparent',
  }[variant];

  const textColor = {
    primary: '#fff',
    secondary: colors.text,
    ghost: colors.textSecondary,
  }[variant];

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
      style={[
        animatedStyle,
        {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: radius.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bgColor,
        },
        props.style,
      ]}
    >
      <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
    </AnimatedPressable>
  );
}
