import { useAppStore } from '../../../store/useAppStore';
import { getDeviceTier, type DeviceTier } from '../../../lib/deviceTier';
import { useA11ySignals } from '../../../lib/a11ySignals';

export type PerformanceMode = 'default' | 'hot' | 'overlay' | 'hero';

/**
 * How much a translucent surface is allowed to cost.
 *
 *   shader  a Skia fragment shader — refraction, specular light, live tint
 *   blur    expo-blur behind a tinted fill (what GlassPanel has always done)
 *   solid   an opaque fill; no blur, no canvas, no per-frame work
 *
 * Tiering exists because Echo's audience is largely mid and low-end Android, where a
 * full-screen shader is the difference between a 60fps feed and an unusable one.
 */
export type SurfaceTier = 'shader' | 'blur' | 'solid';

export interface PerformanceProfile {
  reduceMotion: boolean;
  useBlur: boolean;
  pressAnimations: boolean;
  listAnimations: boolean;
  mountAnimations: boolean;
  maxBlurIntensity: number;
  surfaceTier: SurfaceTier;
}

export interface PerformanceOptions {
  reduceAnimations: boolean;
  dataSaver: boolean;
  glassTheme: boolean;
  /**
   * Omitted by callers that predate tiering. Defaulting to 'mid' keeps them on the
   * blur path they already had — an unknown device is never optimistically handed a
   * shader.
   */
  deviceTier?: DeviceTier;
  osReduceMotion?: boolean;
  osReduceTransparency?: boolean;
}

export function resolvePerformanceProfile(
  mode: PerformanceMode,
  options: PerformanceOptions
): PerformanceProfile {
  const {
    reduceAnimations,
    dataSaver,
    glassTheme,
    deviceTier = 'mid',
    osReduceMotion = false,
    osReduceTransparency = false,
  } = options;

  // Max responsive mode: treat everything as 'hot'
  const isHot = !glassTheme;
  const reduceMotion = reduceAnimations || dataSaver || isHot || osReduceMotion;

  // Any one of these is a decision the user already made, explicitly or by
  // carrying the hardware they carry. None of them is worth overriding for looks.
  const forceSolid =
    !glassTheme || dataSaver || osReduceTransparency || deviceTier === 'low';

  const surfaceTier: SurfaceTier = forceSolid
    ? 'solid'
    : // A shader is animated by definition, so it cannot survive reduced motion.
      // 'hot' marks surfaces re-rendered per row mid-scroll; never shade those.
      deviceTier === 'high' && mode !== 'hot' && !reduceMotion
      ? 'shader'
      : 'blur';

  const useBlur = surfaceTier !== 'solid';
  const maxBlurIntensity = useBlur ? 100 : 0;

  return {
    reduceMotion,
    useBlur,
    pressAnimations: !reduceMotion && !isHot,
    listAnimations: !reduceMotion && !isHot,
    mountAnimations: !reduceMotion && !isHot,
    maxBlurIntensity,
    surfaceTier,
  };
}

export function usePerformanceProfile(mode: PerformanceMode = 'default'): PerformanceProfile {
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const dataSaver = useAppStore(s => s.dataSaver);
  const glassTheme = useAppStore(s => s.glassTheme);
  const { reduceMotion: osReduceMotion, reduceTransparency: osReduceTransparency } =
    useA11ySignals();

  return resolvePerformanceProfile(mode, {
    reduceAnimations,
    dataSaver,
    glassTheme,
    deviceTier: getDeviceTier(),
    osReduceMotion,
    osReduceTransparency,
  });
}
