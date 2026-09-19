import type { SurfaceTier } from '../../src/shared/lib/performance';

/**
 * How a full-bleed chrome surface fades into the content behind it.
 *
 * Split out from EdgeGlass for the same reason liquidGlassTier is split out of
 * LiquidGlass: the decision is arithmetic and deserves to be checked without a GPU,
 * a device tier, or a rendered frame.
 *
 * The technique is stacked blurs of decreasing reach. Layer 0 spans the whole
 * depth at the faintest setting; each later layer stops further short of the inner
 * edge and hits harder, so the strip against the screen edge is blurred by every
 * layer and the far end by only the first. Each layer's own boundary is still a
 * discontinuity — but at a fraction of full strength, and N small steps read as a
 * ramp where one full-strength step reads as the cut it is.
 *
 * The ramp lives in the tail, not in the bar. Every layer covers the bar itself and
 * then some, so the glass is at full strength under the title and the tab labels;
 * only the `fadeLength` past it sheds layers. Spreading the ramp across the whole depth
 * instead would leave the inner edge of the bar — where the text sits — barely
 * blurred, which is the legibility problem the chrome exists to solve.
 */

export interface RampLayer {
  /** How far this layer reaches in from the screen edge, in points. */
  depth: number;
  /** expo-blur intensity for this layer. */
  intensity: number;
}

/** Layers by tier. Each one is a real backdrop pass, so this is a budget, not a taste. */
const LAYER_COUNT: Record<SurfaceTier, number> = { shader: 4, blur: 3, solid: 0 };

/**
 * Per-layer strength, outermost first.
 *
 * Tuned by eye rather than derived. Gaussian blur does not compose linearly —
 * stacking N passes of sigma gives sigma*sqrt(N), not sigma*N — so dividing the
 * target evenly across layers lands nowhere near it. These ramp steeply because
 * the interesting half of the gradient is the near half.
 */
const WEIGHTS: Record<number, readonly number[]> = {
  2: [0.2, 0.5],
  3: [0.14, 0.26, 0.44],
  4: [0.1, 0.18, 0.3, 0.46],
};

export function rampLayerCount(tier: SurfaceTier, cap?: number): number {
  const n = LAYER_COUNT[tier] ?? 0;
  return cap === undefined ? n : Math.min(n, cap);
}

export function buildRamp(
  tier: SurfaceTier,
  maxIntensity: number,
  /** The bar itself. Every layer reaches at least this far. */
  barDepth: number,
  /** Bar plus fade. Only the outermost layer reaches this far. */
  total: number,
  cap?: number,
): RampLayer[] {
  const count = rampLayerCount(tier, cap);
  const weights = WEIGHTS[count];
  if (!weights || maxIntensity <= 0 || total <= 0) return [];

  const tail = Math.max(0, total - barDepth);

  // Divided by `length`, not `length - 1`, so no layer edge ever lands exactly on
  // the bar boundary. The innermost still overshoots the bar by one slice of tail.
  // That matters more than it sounds: the tint gradient also changes slope there,
  // and two discontinuities at the same y stop being a fade and become a line —
  // which is the exact artifact this component exists to remove.
  return weights.map((weight, i) => ({
    depth: total - (tail * i) / weights.length,
    intensity: Math.max(1, Math.round(maxIntensity * weight)),
  }));
}
