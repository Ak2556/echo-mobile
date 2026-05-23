import React from 'react';
import { View, Platform, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../lib/theme';
import { PerformanceMode, usePerformanceProfile } from '../../lib/performance';

type GlassVariant = 'light' | 'medium' | 'heavy' | 'ultra';

// Variant intensities are deliberately conservative. iOS BlurView is one of
// the most expensive components per-pixel — every 10-point bump in intensity
// roughly doubles GPU cost. The previous values (55/75/90/100) read as
// "smoked glass" but ate 60fps on lower-end devices. The new set keeps the
// premium feel on hero surfaces (HeroCard, tab bar) while dropping the
// per-pixel cost on the dozens of card-level GlassPanels by ~60%.
const VARIANT_INTENSITY: Record<GlassVariant, number> = {
  light:  20,
  medium: 32,
  heavy:  48,
  ultra:  60,
};

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
  borderRadius = 16,
  contentStyle,
  tintOverride,
  bottomHighlight = false,
  elevated = false,
  performanceMode = 'default',
}: GlassPanelProps) {
  const { colors } = useTheme();
  const performance = usePerformanceProfile(performanceMode);

  const baseIntensity = variant
    ? VARIANT_INTENSITY[variant]
    : (intensity ?? VARIANT_INTENSITY.medium);
  const blurIntensity = Math.min(baseIntensity, performance.maxBlurIntensity);

  const fill = tintOverride ?? (colors.glassFill ?? 'rgba(255,255,255,0.07)');
  const border = colors.glassBorder ?? 'rgba(255,255,255,0.13)';
  const highlight = colors.glassHighlight ?? 'rgba(255,255,255,0.09)';

  const outerStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    ...(elevated && {
      shadowColor: '#000',
      shadowOpacity: colors.isDark ? 0.45 : 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    }),
    ...style,
  };

  if (Platform.OS === 'ios' && performance.useBlur && blurIntensity > 0) {
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

  // Android / performance mode: opaque surface with clear border
  return (
    <View
      style={[
        outerStyle,
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: border,
        },
      ]}
    >
      <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
    </View>
  );
}
