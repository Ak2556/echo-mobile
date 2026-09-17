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
  /**
   * Draw the object chrome: the bevel border on all four sides and the 1px
   * highlight along the top.
   *
   * Full-bleed surfaces must turn this off. A header or a tab bar has three of its
   * four edges off-screen, so the border becomes a line with nothing on the far
   * side of it and the highlight becomes a lip on a surface that has none — which
   * is exactly what made them read as slabs pasted over the feed rather than as
   * glass. Default true, so every panel keeps what it had.
   */
  chrome?: boolean;
  /**
   * Pure glass: no fill wash, no reflection sweep, and a blur that actually blurs
   * on Android.
   *
   * The default treatment paints a flat fill over the blur and then sweeps a white
   * gradient across it from the rotation sensor. Both are opaque-ish light drawn
   * *on* the surface, which is the opposite of what a transparent material does —
   * they make the panel read as a tinted tile with a moving shine rather than
   * something you are looking through. A surface that wants to be glass sets this
   * and lets whatever is behind it do the work.
   *
   * An explicit `tintOverride` is still honoured, so a control can colour itself to
   * show state.
   */
  clear?: boolean;
  /**
   * The tilt-driven highlight sweep. Default true, so existing panels are
   * unchanged.
   *
   * Separate from `clear` because they answer different questions. `clear` is about
   * whether anything is painted over the blur; this is about whether what is
   * painted *moves*. A surface can legitimately want a fill for legibility and
   * still not want a light source that slides around as the phone is tilted —
   * every LiquidGlass surface is in exactly that position.
   */
  reflection?: boolean;
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
  chrome = true,
  clear = false,
  reflection = true,
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
  const defaultFill = colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';
  const fill = tintOverride ?? (clear ? null : defaultFill);
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
            // Without this, expo-blur on Android renders nothing at all — the view
            // is simply transparent. A clear panel there would then be a hole
            // rather than glass, so the one treatment that has nothing else to
            // fall back on is the one that has to pay for a real blur.
            experimentalBlurMethod={
              clear && Platform.OS === 'android' ? 'dimezisBlurView' : undefined
            }
            style={StyleSheet.absoluteFill}
          />
          {/* Glass fill overlay. Skipped entirely when clear, so there is no
              flat wash sitting between the content and the blur. */}
          {fill ? <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} /> : null}

          {/* Dynamic Device Reflection — a light source that moves with the device,
              which is a thing a tinted plastic tile does and a pane of glass does
              not. Never drawn on a clear panel. */}
          {reflection && !clear ? (
            <DynamicReflection intensity={colors.isDark ? 0.7 : 1} />
          ) : null}
        </View>

        {chrome && (
          <>
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
          </>
        )}

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
          borderWidth: chrome ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[contentStyle]}>{children}</View>
    </View>
  );
}
