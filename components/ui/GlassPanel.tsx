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
  /** Preset intensity level — overrides explicit `intensity` if provided */
  variant?: GlassVariant;
  /** Explicit blur intensity (0–100). `variant` takes precedence when both set. */
  intensity?: number;
  borderRadius?: number;
  contentStyle?: ViewStyle;
  /** Custom fill color override (e.g. accent-tinted glass) */
  tintOverride?: string;
  /** Show bottom edge highlight in addition to the default top one */
  bottomHighlight?: boolean;
  /** Elevation shadow — depth perception */
  elevated?: boolean;
  performanceMode?: PerformanceMode;
}

export function GlassPanel({
  children,
  style,
  variant,
  intensity,
  borderRadius: customBorderRadius,
  contentStyle,
  tintOverride,
  bottomHighlight = false,
  elevated = false,
  performanceMode = 'default',
}: GlassPanelProps) {
  const { colors, radius, glass } = useTheme();
  const performance = usePerformanceProfile(performanceMode);

  const borderRadius = customBorderRadius ?? radius.card;
  const intensityMap = glass ?? VARIANT_INTENSITY;

  const baseIntensity = variant
    ? intensityMap[variant]
    : (intensity ?? intensityMap.medium);
  const blurIntensity = Math.min(baseIntensity, performance.maxBlurIntensity);

  const fill = tintOverride ?? (colors.glassFill ?? 'rgba(255,255,255,0.07)');
  const border = colors.glassBorder ?? 'rgba(255,255,255,0.13)';
  const highlight = colors.glassHighlight ?? 'rgba(255,255,255,0.09)';

  const outerStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    ...(elevated && {
      shadowColor: '#000',
      shadowOpacity: colors.isDark ? 0.28 : 0.10,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    }),
    ...style,
  };

  if (performance.useBlur && blurIntensity > 0) {
    return (
      <View style={outerStyle}>
        <BlurView
          intensity={blurIntensity}
          tint={colors.isDark ? 'dark' : 'extraLight'}
          style={StyleSheet.absoluteFill}
        />
        {/* Glass fill overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        {/* Top edge highlight */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: highlight,
          }}
        />
        {/* Dynamic Device Reflection */}
        <DynamicReflection intensity={colors.isDark ? 0.6 : 0.8} />
        {/* Optional bottom edge highlight */}
        {bottomHighlight && (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: highlight,
            }}
          />
        )}
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </View>
    );
  }

  // Android / performance mode: borderless, soft transparent background
  return (
    <View
      style={[
        outerStyle,
        {
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          borderWidth: 0,
        },
      ]}
    >
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
    </View>
  );
}
