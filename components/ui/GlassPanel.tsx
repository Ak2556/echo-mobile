import React from 'react';
import { View, Platform, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../lib/theme';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  borderRadius?: number;
  contentStyle?: ViewStyle;
}

export function GlassPanel({
  children,
  style,
  intensity = 55,
  borderRadius = 16,
  contentStyle,
}: GlassPanelProps) {
  const { colors, reduceAnimations } = useTheme();

  const outerStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder ?? 'rgba(255,255,255,0.13)',
    ...style,
  };

  if (Platform.OS === 'ios' && !reduceAnimations) {
    return (
      <View style={outerStyle}>
        <BlurView intensity={intensity} tint={colors.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.glassFill ?? 'rgba(255,255,255,0.07)' },
          ]}
        />
        {/* Top highlight edge */}
        <View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: colors.glassHighlight ?? 'rgba(255,255,255,0.09)',
            },
          ]}
        />
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </View>
    );
  }

  // Android / reduce-motion: solid dark surface with subtle border
  return (
    <View
      style={[
        outerStyle,
        { backgroundColor: colors.surface },
      ]}
    >
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
    </View>
  );
}
