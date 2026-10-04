import React from 'react';
import { View, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeGlassView, isNativeGlassAvailable } from './nativeGlass';
import type { RampLayer } from './edgeGlassRamp';
import { useTheme } from '../../lib/ui/theme';
import { usePerformanceProfile, type PerformanceMode } from '../../lib/ui/performance';

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
/** How far the default fade reaches past the bar. Content that must be legible
 *  at rest has to start below it, or it renders inside the blur. */
export const EDGE_GLASS_FADE = DEFAULT_FADE;


function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Base opacity of the white (or dark) wash over the glass.
 *
 * 0.22 let a sharp post photo show through the header, and over a dark photo
 * the tab bar blurred to mid-grey with the muted-grey icons lost in it (owner,
 * 2026-10-04). A header carries the wordmark over whatever is scrolling under
 * it, so the top edge is the most opaque; the tab bar is lighter, since it is
 * only icons and the owner likes its frosted look. The blur and the tail fade
 * still do the softening. Without any blur the bar has to be the surface.
 */
export function glassWash(edge: 'top' | 'bottom', blurred: boolean, isDark: boolean): number {
  if (!blurred) return 0.96;
  if (edge === 'top') return isDark ? 0.62 : 0.72;
  return isDark ? 0.45 : 0.55;
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
  /**
   * 'dark' draws the bar as a black scrim whatever the app theme is. For a screen
   * that is a full-bleed video, where a white wash over the picture reads as a
   * pale slab; the caller then sets its own icon and label colours to match.
   */
  tone?: 'auto' | 'dark';
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
  tone = 'auto',
}: EdgeGlassProps) {
  const { colors } = useTheme();
  const dark = tone === 'dark' || colors.isDark;
  const profile = usePerformanceProfile(performanceMode);
  // Bound to a local so TypeScript can narrow it into the JSX below.
  const NativeGlass =
    profile.useBlur && isNativeGlassAvailable() ? NativeGlassView : null;

  const total = height + fadeLength;
  // One blur layer over the bar, not a ramp of 2-4 stacked layers reaching into
  // the fade (owner request 2026-10-01: a single layer). The tint gradient
  // below still eases the edge out into the content.
  // No live blur on Android, ever (owner, 2026-10-01: performance first). A
  // dimezis BlurView re-renders everything behind it on every scrolled frame:
  // it cost ~6 ms of GPU per frame on Home (median 23 ms -> 17 ms without it).
  // iOS keeps it: UIVisualEffectView is composited by the system.
  const blurs = Platform.OS !== 'android' && profile.surfaceTier !== 'solid' && profile.maxBlurIntensity > 0;
  const ramp: RampLayer[] = blurs
    ? [{ depth: height, intensity: Math.round(profile.maxBlurIntensity * 0.4) }]
    : [];

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

  const base = tone === 'dark' ? '#000000' : colors.isDark ? colors.bg : '#FFFFFF';
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
  // Light and see-through: the single blur layer carries legibility, so the
  // wash only tints it (was 0.55 / 0.6 over a stack of blur layers).
  // Without a blur under it the bar has to be the surface: at 0.22 the feed
  // read straight through it — post text under the header, a post's like and
  // comment chips under the tab icons ("Home 2", "Explore 1").
  const wash = glassWash(edge, Boolean(NativeGlass || blurs), dark);
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
            colorScheme={dark ? 'dark' : 'light'}
            tintColor={tintColor}
            style={bar}
          />
        ) : (
          <BlurRamp edge={edge} layers={ramp} dark={dark} />
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
