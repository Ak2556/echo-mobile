import React, { useState } from 'react';
import { View, StyleSheet, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { GlassPanel } from './GlassPanel';
import { NativeGlassView, isNativeGlassAvailable } from './nativeGlass';
import { resolveSurface } from './liquidGlassTier';
import { useTheme, GLASS_INTENSITY } from '../../src/shared/lib/theme';
import {
  usePerformanceProfile,
  type PerformanceMode,
  type SurfaceTier,
} from '../../src/shared/lib/performance';

/**
 * A translucent surface that costs what the device can afford.
 *
 *   shader  GlassPanel's blur, with a Skia fragment shader painted over it that
 *           lights the rim, splits colour slightly at the edge, and drifts a
 *           specular band across it
 *   blur    GlassPanel exactly as it has always rendered
 *   solid   GlassPanel's opaque fallback: no blur, no canvas, no per-frame work
 *
 * The blur and solid tiers are not reimplemented here. GlassPanel already picks
 * between them from `usePerformanceProfile`, so this composes rather than forks —
 * one glass look, one place to change it.
 *
 * On the shader: a Skia RuntimeEffect can only sample what is drawn inside its own
 * canvas, never the React Native views behind it. True backdrop displacement of
 * arbitrary app content is therefore not possible, and this does not pretend
 * otherwise. The blur underneath is what actually obscures the background; the
 * shader supplies the light response that makes it read as a material.
 */

// ── Lazy native (OTA-safe: never touched at module load on builds lacking it) ──
// Mirrors the guard in src/features/feed/ui/PhotoEditor.tsx, the only other Skia
// caller. A JS update can reach a binary built before this dependency existed, and
// a bare import there is a crash on launch rather than a missing effect.
let Sk: any = null;
try {
  Sk = require('@shopify/react-native-skia');
} catch {
  Sk = null;
}
const SKIA_OK = !!Sk?.Skia?.RuntimeEffect;

/**
 * The refractive edge of a pane of glass. Nothing else.
 *
 * Glass does not glow, and it does not have a highlight that wanders across it on
 * its own — a moving specular says the *light* is moving, which on a phone held
 * still is a lie the eye catches even when it cannot name it. What actually tells
 * you a pane has depth is the band at its border, where the surface curves away
 * and bends what is behind it. So that is all this draws:
 *
 *   refraction   a gradient falling off from the border, steepest where the
 *                curvature is greatest. The bulk of the effect.
 *   dispersion   the bend is wavelength-dependent, so the band leans warm at one
 *                end of the spectrum and cool at the other, widening toward the
 *                border where the bend is hardest.
 *   contact      a dark line where the band meets the flat centre. Without it the
 *                pane reads as printed on; it is what separates glass from a decal.
 *
 * The centre is left completely alone — fully transparent, nothing painted over
 * it. Whatever is behind the panel is what you see, which is the point.
 *
 * Consequently this has no clock and no per-frame work: it re-renders on layout
 * and then never again. What it cannot do is sample the actual backdrop, so the
 * refraction is modelled rather than measured; see the note on the component for
 * why no API in this stack can, and what does it on iOS 26.
 */
const SOURCE = `
uniform float2 u_size;
uniform float  u_radius;
// 0 suppresses the edge entirely. A full-bleed surface has no edge to light, and
// the signed-distance outline at radius 0 is a rectangle drawn around the screen.
uniform float  u_rim;
// How far the refractive band reaches in from the border, in points. Supplied by
// the caller because it has to scale with the panel: the band that reads as thick
// on a 42pt button reads as a smear across a full-width sheet.
uniform float  u_edge;

float sdRoundRect(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

half4 main(float2 xy) {
  float2 halfSize = u_size * 0.5;
  float2 p = xy - halfSize;
  float d = sdRoundRect(p, halfSize, u_radius);

  // Everything is clipped to the rounded shape; nothing paints outside it.
  float inside = 1.0 - smoothstep(-1.5, 0.5, d);

  // 0 at the border, 1 where the band settles into the flat centre of the pane.
  float band = clamp(-d / max(u_edge, 1.0), 0.0, 1.0);

  // The refractive shoulder. Light bends hardest where the surface curves most,
  // which is right at the border, and the falloff is steep rather than linear —
  // a linear ramp reads as a gradient someone drew, not as a curved surface.
  float shoulder = pow(1.0 - band, 2.4) * inside * u_rim;

  // The lit bevel itself, a narrow hot line riding on top of the shoulder.
  float bevel = (1.0 - smoothstep(0.0, 2.0, abs(d))) * inside * u_rim;

  // Contact shadow where the shoulder meets the flat. Narrow, offset inward, and
  // the single cheapest thing that stops a pane looking like a sticker.
  float contact = exp(-26.0 * (band - 0.52) * (band - 0.52)) * inside * u_rim;

  // Everything that adds light, and the one thing that removes it. They are kept
  // apart because the output is premultiplied: a dark contribution is alpha with
  // no colour behind it, not a negative colour.
  float lift  = shoulder * 0.13 + bevel * 0.40;
  float shade = contact * 0.16;

  // Both terms are zero once band reaches 1, so the centre of the pane is exactly
  // untouched rather than merely faint.
  float a = clamp(lift + shade, 0.0, 0.88);

  // Dispersion. Red refracts least and blue most, which is why glass edges go warm
  // on one side and cold on the other. The split widens toward the border.
  half3 tintv = half3(1.0, 1.0, 1.0);
  tintv.r += shoulder * 0.05 + bevel * 0.10;
  tintv.b += shoulder * 0.09 + bevel * 0.20;

  // Premultiplied, as Skia expects. 'shade' deliberately carries no colour: that
  // is what makes it darken rather than tint.
  return half4(tintv * lift, a);
}
`;

type GlassVariant = keyof typeof GLASS_INTENSITY;

export interface LiquidGlassProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  variant?: GlassVariant;
  intensity?: number;
  borderRadius?: number;
  contentStyle?: ViewStyle;
  tintOverride?: string;
  fallbackTint?: string;
  elevated?: boolean;
  performanceMode?: PerformanceMode;
  /**
   * Ceiling for this instance. A surface sitting behind scrolling content should
   * pass 'blur' however capable the device is.
   */
  maxTier?: SurfaceTier;
  /** Forwarded to GlassPanel. Full-bleed surfaces pass false. See GlassPanel. */
  chrome?: boolean;
  /**
   * Forwarded to GlassPanel: drop the fill wash and the reflection sweep, and blur
   * for real on Android. A surface using the refractive edge almost always wants
   * this — the edge is the whole effect, and a flat wash under it hides the thing
   * it is meant to be refracting.
   */
  clear?: boolean;
}

/** Compiled once per process — RuntimeEffect.Make is not cheap and the source is fixed. */
let compiled: unknown | null | undefined;
function effect(): unknown | null {
  if (compiled !== undefined) return compiled;
  try {
    compiled = Sk.Skia.RuntimeEffect.Make(SOURCE) ?? null;
  } catch {
    compiled = null;
  }
  return compiled;
}

export function LiquidGlass({
  children,
  style,
  variant,
  intensity,
  borderRadius: customRadius,
  contentStyle,
  tintOverride,
  fallbackTint,
  elevated = false,
  performanceMode = 'default',
  maxTier = 'shader',
  chrome = true,
  clear = false,
}: LiquidGlassProps) {
  const { radius, colors } = useTheme();
  const profile = usePerformanceProfile(performanceMode);
  const borderRadius = customRadius ?? radius.card;

  const tier = resolveSurface(profile.surfaceTier, SKIA_OK, maxTier);
  // Bound to a local so TypeScript can narrow it into the JSX below.
  const NativeGlass =
    tier !== 'solid' && isNativeGlassAvailable() ? NativeGlassView : null;

  // Measured rather than assumed: the shader needs real pixel dimensions, and a
  // glass panel is almost always sized by its parent's layout.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  // On the shader tier the host owns the layout and the panel fills it, because
  // the Skia canvas has to overlay the panel's exact box. Handing the caller's
  // style to the panel instead leaves the host with no size at all — which is
  // invisible for a caller passing absolute offsets or a fixed height (all of them,
  // until the feed action buttons), and total collapse for one passing `flex: 1`.
  const panel = (
    <GlassPanel
      style={tier === 'shader' ? styles.fill : style}
      variant={variant}
      intensity={intensity}
      borderRadius={borderRadius}
      contentStyle={contentStyle}
      tintOverride={tintOverride}
      fallbackTint={fallbackTint}
      elevated={elevated}
      performanceMode={performanceMode}
      chrome={chrome}
      clear={clear}
      // Never, on any tier. The refractive edge is the whole effect here, and a
      // white gradient sliding across the face from the rotation sensor is the
      // "animated glass background" it exists to replace. It also costs every
      // panel a 60Hz sensor subscription and a spring on a 300%-sized view.
      reflection={false}
    >
      {children}
    </GlassPanel>
  );

  // iOS 26's real glass replaces both the blur and the shader when it is there.
  // Not a tier above them: UIVisualEffectView costs less than our own Skia canvas,
  // so gating it behind `deviceTier === 'high'` would withhold the better and
  // cheaper surface from the devices that need it most. `solid` still wins, because
  // that is reduce-transparency or data saver asking for no translucency at all.
  if (NativeGlass) {
    // `overflow: hidden` would clip the drop shadow off, so elevation is carried
    // by an outer view and the glass is clipped inside it. The callers that pass
    // `elevated` are sheets, and a sheet with no shadow does not read as lifted
    // off the screen.
    const lift: ViewStyle = elevated
      ? {
          shadowColor: colors.isDark ? '#000' : colors.accent,
          shadowOpacity: colors.isDark ? 0.4 : 0.15,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 6,
        }
      : {};
    return (
      <View style={[{ borderRadius }, lift, style]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]}>
          <NativeGlass
            glassEffectStyle="regular"
            colorScheme={colors.isDark ? 'dark' : 'light'}
            tintColor={tintOverride}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={contentStyle}>{children}</View>
      </View>
    );
  }

  if (tier !== 'shader') return panel;

  return (
    <View style={[styles.host, style]} onLayout={onLayout}>
      {panel}
      {size.width > 0 && size.height > 0 ? (
        <RefractiveEdge
          width={size.width}
          height={size.height}
          borderRadius={borderRadius}
          rim={chrome ? 1 : 0}
        />
      ) : null}
    </View>
  );
}

/**
 * The Skia layer. Separated so it only ever mounts on the shader tier — the canvas
 * exists only where it is actually drawn.
 *
 * No clock, no shared values, no reanimated. The uniforms are a plain object and
 * they only change when the panel is re-measured, so this paints once per layout
 * and then sits there. The previous version drove a drifting specular off
 * `useClock`, which meant every glass surface on screen re-shaded every pixel every
 * frame for a highlight that was wrong anyway: a moving specular says the light
 * source is moving, which on a phone lying still is a lie.
 */
function RefractiveEdge({
  width,
  height,
  borderRadius,
  rim,
}: {
  width: number;
  height: number;
  borderRadius: number;
  rim: number;
}) {
  // The refractive band scales with the panel, and is capped hard against its
  // short side. The cap is the whole ballgame: at 0.42 of the short side a 42pt
  // action button had a 17pt band biting in from both edges, which leaves three
  // points of flat centre — the control stopped reading as glass and became a
  // glowing pill. An edge has to be a fraction of the thing it edges.
  const edge = Math.max(3, Math.min(borderRadius * 0.9, Math.min(width, height) * 0.18));
  const source = effect();

  const uniforms = {
    u_size: [width, height],
    u_radius: borderRadius,
    u_rim: rim,
    u_edge: edge,
  };

  if (!source) return null;

  const { Canvas, Fill, Shader } = Sk;
  return (
    <Canvas style={[StyleSheet.absoluteFill, styles.sheen]} pointerEvents="none">
      <Fill>
        <Shader source={source} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  host: { position: 'relative' },
  fill: { flex: 1 },
  // Purely decorative: it must never intercept a touch meant for the content.
  sheen: { pointerEvents: 'none' },
});
