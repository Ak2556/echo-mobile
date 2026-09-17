import type { ComponentType } from 'react';
import { Platform } from 'react-native';

/**
 * iOS 26's Liquid Glass, if this binary actually has it.
 *
 * `UIGlassEffect` is the only thing in this stack that genuinely refracts what is
 * behind it. A Skia RuntimeEffect cannot sample the React Native views under its
 * canvas (see the note in LiquidGlass.tsx), so everything the shader tier draws is
 * painted on top of the blur rather than through it. This is the real article.
 *
 * ── Why the lazy require ──────────────────────────────────────────────────────
 * Two separate things can be missing, and they fail differently:
 *
 *   the JS package   absent from an older bundle -> `require` throws
 *   the native view  absent from an older binary -> `requireNativeViewManager`,
 *                    which GlassView.ios.js calls at MODULE LOAD, throws
 *
 * Echo ships JS updates over the air into binaries that predate their
 * dependencies, so a bare top-level import here is a crash on launch rather than a
 * missing effect — the same hazard the Skia guard exists for. Both failures land in
 * the one catch below.
 *
 * Availability is deliberately NOT a performance decision. UIVisualEffectView is
 * cheaper than our own Skia canvas, so this is a substitution for the blur and
 * shader tiers rather than a rung above them; ranking it higher would gate real
 * glass behind `deviceTier === 'high'` for no reason. `osReduceTransparency`
 * already collapses the profile to `solid` upstream, so accessibility is handled
 * before this is ever consulted.
 */

let Mod: any = null;
try {
  Mod = require('expo-glass-effect');
} catch {
  Mod = null;
}

/** The native view, or null. Callers must branch on `isNativeGlassAvailable()` first. */
export const NativeGlassView: ComponentType<any> | null = Mod?.GlassView ?? null;

/**
 * The grouping view, or null.
 *
 * Glass panes inside one of these influence each other as they approach: they bulge
 * toward one another and merge, the way Apple's own grouped controls do. For a row
 * of six adjacent buttons that is the difference between six panes and one strip of
 * liquid, and it is the single most "liquid" thing the platform hands out.
 */
export const NativeGlassContainer: ComponentType<any> | null = Mod?.GlassContainer ?? null;

let cached: boolean | undefined;

export function isNativeGlassAvailable(): boolean {
  if (cached !== undefined) return cached;

  if (Platform.OS !== 'ios' || !Mod?.GlassView || typeof Mod.isLiquidGlassAvailable !== 'function') {
    cached = false;
    return cached;
  }

  try {
    cached = !!Mod.isLiquidGlassAvailable();
  } catch {
    cached = false;
  }
  return cached;
}

/** Test seam only. The real value is resolved once per process. */
export function __resetNativeGlassCache() {
  cached = undefined;
}
