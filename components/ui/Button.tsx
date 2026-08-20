import React from 'react';
import { PressableProps, Text, View, Platform, StyleSheet } from 'react-native';
import { GlassPanel } from './GlassPanel';
import { useTheme } from '../../src/shared/lib/theme';
import { AnimatedPressable } from './AnimatedPressable';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'compact' | 'regular';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({ label, variant = 'primary', size = 'regular', leftIcon, rightIcon, ...props }: ButtonProps) {
  const { colors, radius, reduceAnimations } = useTheme();
  const paddingHorizontal = size === 'compact' ? 12 : 16;
  const paddingVertical = size === 'compact' ? 8 : 12;

  const textColor = {
    primary: '#fff',
    secondary: colors.text,
    ghost: colors.textSecondary,
  }[variant];

  if ((variant === 'secondary' || variant === 'ghost') && Platform.OS === 'ios' && !reduceAnimations) {
    return (
      <AnimatedPressable
        {...props}
        depth="soft"
        fadeOnPress
        sinkOnPress={!reduceAnimations}
        style={[
          {
            borderRadius: radius.lg,
          },
          props.style,
        ]}
      >
        <GlassPanel
          borderRadius={radius.lg}
          intensity={variant === 'secondary' ? 60 : 30}
          tintOverride={
            variant === 'secondary'
              ? (colors.glassHeavyFill ?? 'rgba(255,255,255,0.1)')
              : 'transparent'
          }
          contentStyle={{
            paddingHorizontal,
            paddingVertical,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {leftIcon}
          <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
          {rightIcon}
        </GlassPanel>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      {...props}
      depth={variant === 'primary' ? 'medium' : 'soft'}
      fadeOnPress={variant !== 'primary'}
      sinkOnPress={!reduceAnimations}
      style={[
        {
          paddingHorizontal,
          paddingVertical,
          borderRadius: radius.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
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
      {leftIcon}
      <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
      {rightIcon}
    </AnimatedPressable>
  );
}
