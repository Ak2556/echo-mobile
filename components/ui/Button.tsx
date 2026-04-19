import React from 'react';
import { Pressable, Text, PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ label, variant = 'primary', ...props }: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const baseClasses = 'px-4 py-3 rounded-xl flex-row items-center justify-center';
  const variantClasses = {
    primary: 'bg-blue-600',
    secondary: 'bg-zinc-800',
    ghost: 'bg-transparent',
  };
  const textClasses = {
    primary: 'text-white font-semibold',
    secondary: 'text-white font-semibold',
    ghost: 'text-zinc-300 font-medium',
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className={`${baseClasses} ${variantClasses[variant]}`}
      {...props}
      style={[animatedStyle, props.style]}
    >
      <Text className={textClasses[variant]}>{label}</Text>
    </AnimatedPressable>
  );
}
