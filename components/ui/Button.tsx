import React from 'react';
import { Pressable, Text, PressableProps, View, Platform, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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

  const textColor = {
    primary: '#fff',
    secondary: colors.text,
    ghost: colors.textSecondary,
  }[variant];

  if ((variant === 'secondary' || variant === 'ghost') && Platform.OS === 'ios' && !reduceAnimations) {
    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...props}
        style={[
          animatedStyle,
          {
            borderRadius: radius.lg,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
          },
          props.style,
        ]}
      >
        <BlurView
          intensity={variant === 'secondary' ? 60 : 30}
          tint={colors.isDark ? 'dark' : 'extraLight'}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                variant === 'secondary'
                  ? (colors.glassHeavyFill ?? 'rgba(255,255,255,0.1)')
                  : 'transparent',
            },
          ]}
        />
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
        </View>
      </AnimatedPressable>
    );
  }

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
          backgroundColor:
            variant === 'primary'
              ? colors.accent
              : variant === 'secondary'
              ? colors.surface
              : 'transparent',
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.glassBorder,
        },
        props.style,
      ]}
    >
      <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
    </AnimatedPressable>
  );
}
