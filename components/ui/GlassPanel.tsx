import React from 'react';
import { View, Platform, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { DynamicReflection } from './DynamicReflection';
import { useTheme, GLASS_INTENSITY } from '../../src/shared/lib/theme';
import { PerformanceMode, usePerformanceProfile } from '../../src/shared/lib/performance';

type GlassVariant = keyof typeof GLASS_INTENSITY;

const VARIANT_INTENSITY = GLASS_INTENSITY;

interface GlassPanelProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: GlassVariant;
  intensity?: number;
  borderRadius?: number;
  contentStyle?: ViewStyle;
  tintOverride?: string;
  fallbackTint?: string;
  bottomHighlight?: boolean;
  elevated?: boolean;
  performanceMode?: PerformanceMode;
  /**
   * Keep this view in the native hierarchy.
   *
   * React Native flattens views that exist only for layout, and a flattened
   * view has no native node — so a GestureDetector wrapping one has nothing to
   * attach to and its gesture silently stops firing. Needed by any caller that
   * puts a GlassPanel directly inside a GestureDetector.
   */
  collapsable?: boolean;
}

export function GlassPanel({
  children,
  style,
  variant,
  intensity,
  borderRadius: customBorderRadius,
  contentStyle,
  tintOverride,
  fallbackTint,
  bottomHighlight = false,
  elevated = false,
  performanceMode = 'default',
  collapsable,
}: GlassPanelProps) {
  const { colors, radius, glass } = useTheme();
  const performance = usePerformanceProfile(performanceMode);

  const borderRadius = customBorderRadius ?? radius.card;
  const intensityMap = glass ?? VARIANT_INTENSITY;

  const baseIntensity = variant
    ? intensityMap[variant]
    : (intensity ?? intensityMap.medium);
  const blurIntensity = Math.min(baseIntensity, performance.maxBlurIntensity);

  // Premium fill and border colors
  const fill = tintOverride ?? (colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)');
  const fallback = fallbackTint ?? colors.surface;
  const border = colors.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)';
  const innerShadow = colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)';
  
  // Outer container handles layout and shadows (unclipped)
  const outerStyle: ViewStyle = {
    borderRadius,
    ...(elevated && {
      shadowColor: colors.isDark ? '#000' : colors.accent,
      shadowOpacity: colors.isDark ? 0.4 : 0.15,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    }),
    ...style,
  };

  // Inner container clips the blur and gradients
  const innerStyle: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    borderRadius,
    overflow: 'hidden',
  };

  if (performance.useBlur && blurIntensity > 0) {
    return (
      <View style={outerStyle} collapsable={collapsable}>
        <View style={innerStyle}>
          <BlurView
            intensity={blurIntensity}
            tint={colors.isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          {/* Glass fill overlay */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
          
          {/* Dynamic Device Reflection */}
          <DynamicReflection intensity={colors.isDark ? 0.7 : 1} />
        </View>

        {/* 1px Inner stroke to create the bevel effect */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: border,
              pointerEvents: 'none',
            },
          ]}
        />
        
        {/* Soft Inner Highlight at the top edge */}
        <View
          style={{
            position: 'absolute',
            top: 1,
            left: 1,
            right: 1,
            height: 1,
            backgroundColor: innerShadow,
            borderTopLeftRadius: borderRadius - 1,
            borderTopRightRadius: borderRadius - 1,
            pointerEvents: 'none',
          }}
        />

        <View style={[{ zIndex: 2 }, contentStyle]}>{children}</View>
      </View>
    );
  }

  // Fallback for when glass theme is disabled
  return (
    <View
      collapsable={collapsable}
      style={[
        outerStyle,
        {
          backgroundColor: fallback,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[contentStyle]}>{children}</View>
    </View>
  );
}
