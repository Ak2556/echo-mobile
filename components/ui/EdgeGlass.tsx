import React from 'react';
import { View, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeGlassView, isNativeGlassAvailable } from './nativeGlass';
import { buildRamp, type RampLayer } from './edgeGlassRamp';
import { useTheme } from '../../src/shared/lib/theme';
import { usePerformanceProfile, type PerformanceMode } from '../../src/shared/lib/performance';

/**
 * The glass under a header or a tab bar.
 *
 * Distinct from GlassPanel and LiquidGlass, and the distinction is the whole
 * point: those draw an *object* — four rounded edges, a rim light, a bevel — and
 * screen chrome is not an object. Three of a tab bar's four sides are off-screen,
 * so a border around it is a line with nothing on the other side of it, and a 1px
 * top highlight is a bevel on a surface that has no lip. Drawn at borderRadius 0
 * they stop reading as material and start reading as a slab pasted over the feed.
 *
 * What this draws instead is a gradient in depth. Blur and tint are strongest
 * against the screen edge and decay to nothing `fadeLength` points into the
 * content, so there is no boundary to see — the feed goes out of focus on its way
 * under the chrome rather than being guillotined by it.
 *
 *   native   iOS 26 UIGlassEffect: real refraction. One uniform pane, because a
 *            UIVisualEffectView cannot be gradient-masked — the tail below it is
 *            what softens the hand-off. This is what Apple's own bars do.
 *   shader   four stacked blurs, each reaching less far in, so blur accumulates
 *   blur     the same, three layers
 *   solid    the tail gradient alone; no blur, no per-frame work
 */

const DEFAULT_FADE = 36;

/**
 * Android's cap.
 *
 * expo-blur only really blurs on Android through `experimentalBlurMethod`, and
 * that path renders each pass into an offscreen bitmap. Four of those under a
 * scrolling feed is how a mid-range Android gets hot — the same budget that kept
 * settings.tsx and the feed cards off the shader tier.
 */
const ANDROID_LAYER_CAP = 2;

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface EdgeGlassProps {
  /** Which screen edge this is pinned to. Decides which way the fade runs. */
  edge: 'top' | 'bottom';
  /** Height of the bar itself, safe-area inset included. */
  height: number;
  /** How far past the bar the fade reaches into the content. */
  fadeLength?: number;
  /** Optional colour wash over the glass. Omit for the plain material. */
  tintColor?: string;
  children?: React.ReactNode;
  /** Applied to the bar, not to the fade — padding and layout belong here. */
  contentStyle?: ViewStyle;
  /**
   * Applied to the backdrop only, so a caller can fade the glass in on scroll
   * without fading its own title and buttons with it. Takes a Reanimated style.
   */
  backdropStyle?: StyleProp<ViewStyle>;
  style?: ViewStyle;
  performanceMode?: PerformanceMode;
}

export function EdgeGlass({
  edge,
  height,
  fadeLength = DEFAULT_FADE,
  tintColor,
  children,
  contentStyle,
  backdropStyle,
  style,
  performanceMode = 'default',
}: EdgeGlassProps) {
  const { colors } = useTheme();
  const profile = usePerformanceProfile(performanceMode);
  // Bound to a local so TypeScript can narrow it into the JSX below.
  const NativeGlass =
    profile.useBlur && isNativeGlassAvailable() ? NativeGlassView : null;

  const total = height + fadeLength;
  const ramp = buildRamp(
    profile.surfaceTier,
    profile.maxBlurIntensity,
    height,
    total,
    Platform.OS === 'android' ? ANDROID_LAYER_CAP : undefined,
  );

  // The host is taller than the bar so the fade has somewhere to live. Android
  // clips children to their parent's bounds, so the tail cannot simply overflow.
  // `box-none` keeps the extra height from swallowing taps meant for the feed.
  const host: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    [edge]: 0,
    height: total,
    ...style,
  };

  const bar: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    [edge]: 0,
    height,
  };

  // Gradients run edge-inward, so `start` is whichever end is against the screen.
  const start = edge === 'top' ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 };
  const end = edge === 'top' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };

  const base = colors.isDark ? colors.bg : '#FFFFFF';
  const barFraction = height / total;

  // Flat across the bar, then eased out across the tail.
  //
  // Fading the tint inside the bar would leave the title and the tab labels
  // sitting on bare feed at the inner edge, which is what they are there to be
  // legible against. But a two-stop gradient turns the bar boundary into a corner
  // in the alpha curve, and a corner is visible as a line however smooth each side
  // of it is — that line was clearly there on Android. So the hold releases just
  // inside the bar and the falloff is stepped to approximate an ease rather than a
  // straight ramp; the eye finds a slope change far harder to see than a kink.
  const wash = colors.isDark ? 0.55 : 0.6;
  const tailFraction = 1 - barFraction;
  const washColors = [
    withAlpha(base, wash),
    withAlpha(base, wash),
    withAlpha(base, wash * 0.86),
    withAlpha(base, wash * 0.45),
    withAlpha(base, wash * 0.14),
    withAlpha(base, 0),
  ] as const;
  const washLocations = [
    0,
    barFraction * 0.78,
    barFraction,
    barFraction + tailFraction * 0.34,
    barFraction + tailFraction * 0.66,
    1,
  ] as const;

  return (
    <View style={host} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
        {NativeGlass ? (
          <NativeGlass
            glassEffectStyle="regular"
            colorScheme={colors.isDark ? 'dark' : 'light'}
            tintColor={tintColor}
            style={bar}
          />
        ) : (
          <BlurRamp edge={edge} layers={ramp} dark={colors.isDark} />
        )}

        <LinearGradient
          colors={washColors as unknown as readonly [string, string, ...string[]]}
          locations={washLocations as unknown as readonly [number, number, ...number[]]}
          start={start}
          end={end}
          style={StyleSheet.absoluteFill}
        />

        {tintColor && !NativeGlass ? (
          <View style={[bar, { backgroundColor: tintColor }]} />
        ) : null}
      </Animated.View>

      <View style={[bar, contentStyle]}>{children}</View>
    </View>
  );
}

/** Paints what `buildRamp` worked out. The arithmetic lives in edgeGlassRamp.ts. */
function BlurRamp({
  edge,
  layers,
  dark,
}: {
  edge: 'top' | 'bottom';
  layers: RampLayer[];
  dark: boolean;
}) {
  return (
    <>
      {layers.map((layer, i) => (
        <BlurView
          key={i}
          testID="edge-glass-blur"
          intensity={layer.intensity}
          tint={dark ? 'dark' : 'light'}
          // Android does not blur at all without this; the default renders a flat
          // translucent overlay, which would make the ramp a banded tint rather
          // than a gradient in focus. ANDROID_LAYER_CAP is what pays for it.
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height: layer.depth }}
        />
      ))}
    </>
  );
}
