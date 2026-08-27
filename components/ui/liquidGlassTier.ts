import type { SurfaceTier } from '../../src/shared/lib/performance';

/**
 * Which surface a LiquidGlass instance should actually draw.
 *
 * Split out from the component so it can be tested without a GPU. The decision has
 * three inputs and they are not interchangeable:
 *
 *   profileTier   what the device and the user's settings allow (performance.ts)
 *   skiaAvailable whether the Skia module is really present in *this* binary
 *   maxTier       a ceiling the call site imposes, e.g. a surface that sits behind
 *                 scrolling content and should never pay for a shader
 *
 * Skia availability matters because the shader path can be published over the air
 * into a binary that predates the dependency. Asking the module rather than assuming
 * it is the difference between a graceful blur and a crash on launch.
 */

const RANK: Record<SurfaceTier, number> = { solid: 0, blur: 1, shader: 2 };

export function resolveSurface(
  profileTier: SurfaceTier,
  skiaAvailable: boolean,
  maxTier: SurfaceTier = 'shader',
): SurfaceTier {
  let rank = Math.min(RANK[profileTier], RANK[maxTier]);

  // No Skia in this binary: the shader tier is not merely expensive, it is absent.
  if (!skiaAvailable && rank === RANK.shader) rank = RANK.blur;

  return (Object.keys(RANK) as SurfaceTier[]).find(k => RANK[k] === rank) ?? 'solid';
}
