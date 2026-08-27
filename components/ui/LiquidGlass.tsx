import React, { useState } from 'react';
import { View, StyleSheet, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
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
 * Rim light, chromatic edge split, and a drifting specular sweep.
 *
 * Kept to a signed-distance rounded rectangle and two exponentials: this runs per
 * pixel per frame, and the tier above it already decided the device can spare that.
 */
const SOURCE = `
uniform float2 u_size;
uniform float  u_time;
uniform float2 u_tilt;
uniform float  u_radius;

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

  // Bright hairline just within the border — the bevel that reads as thickness.
  float edge = (1.0 - smoothstep(0.0, 3.0, abs(d))) * inside;

  // Specular band. u_tilt steers it; the caller supplies a slow drift so the
  // highlight wanders rather than sitting still.
  float2 dir = normalize(float2(0.55, -0.83) + u_tilt * 0.8);
  float longest = max(u_size.x, u_size.y);
  float proj = dot(p / longest, dir);
  float centre = u_tilt.x * 0.25 + sin(u_time * 0.3) * 0.2;
  float sweep = exp(-36.0 * (proj - centre) * (proj - centre)) * inside * 0.5;

  float a = clamp(edge * 0.5 + sweep, 0.0, 0.85);

  // Glass disperses: the rim leans warm on one side, cool on the other.
  half3 col = half3(1.0, 1.0, 1.0);
  col.r += edge * 0.10;
  col.b += edge * 0.16;

  // Premultiplied, as Skia expects from a runtime effect.
  return half4(col * a, a);
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
}: LiquidGlassProps) {
  const { radius } = useTheme();
  const profile = usePerformanceProfile(performanceMode);
  const borderRadius = customRadius ?? radius.card;

  const tier = resolveSurface(profile.surfaceTier, SKIA_OK, maxTier);

  // Measured rather than assumed: the shader needs real pixel dimensions, and a
  // glass panel is almost always sized by its parent's layout.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  const panel = (
    <GlassPanel
      style={style}
      variant={variant}
      intensity={intensity}
      borderRadius={borderRadius}
      contentStyle={contentStyle}
      tintOverride={tintOverride}
      fallbackTint={fallbackTint}
      elevated={elevated}
      performanceMode={performanceMode}
    >
      {children}
    </GlassPanel>
  );

  if (tier !== 'shader') return panel;

  return (
    <View style={styles.host} onLayout={onLayout}>
      {panel}
      {size.width > 0 && size.height > 0 ? (
        <ShaderSheen width={size.width} height={size.height} borderRadius={borderRadius} />
      ) : null}
    </View>
  );
}

/**
 * The Skia layer. Separated so its hooks only ever mount on the shader tier —
 * the Skia canvas and clock only exist where they are actually drawn.
 */
function ShaderSheen({
  width,
  height,
  borderRadius,
}: {
  width: number;
  height: number;
  borderRadius: number;
}) {
  const source = effect();
  const clock = Sk.useClock();

  // Driven by the clock alone, deliberately.
  //
  // The richer version fed device tilt in through useAnimatedSensor, so the
  // highlight appeared to stay fixed in the room while the panel moved under it.
  // That crashed natively on the iOS simulator, which has no CoreMotion, and the
  // crash survived guarding the sensor read — the hook itself is the problem, not
  // the value. Since it cannot be verified here, the sensor is left out rather
  // than shipped unverified; a slow drift reads well enough on its own, and the
  // tilt input can be reinstated behind an availability check once it can be
  // tested on hardware.
  const uniforms = useDerivedValue(() => {
    const t = (clock?.value ?? 0) / 1000;
    // A slow, irrational-ratio wander, so the sweep never visibly loops.
    const drift: [number, number] = [Math.sin(t * 0.21) * 0.5, Math.cos(t * 0.13) * 0.35];
    return {
      u_size: [width, height],
      u_time: t,
      u_tilt: drift,
      u_radius: borderRadius,
    };
  }, [width, height, borderRadius]);

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
  // Purely decorative: it must never intercept a touch meant for the content.
  sheen: { pointerEvents: 'none' },
});
