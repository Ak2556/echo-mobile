/**
 * Color-matrix math for the photo editor's Adjust + Filters controls.
 *
 * A matrix is 20 numbers (row-major 4×5) in Skia's ColorMatrix form, applied to
 * normalized [0,1] RGBA channels; the 5th column of each row is an added offset.
 * Pure + framework-free so it's unit-testable and OTA-safe (no native imports).
 */

export type ColorMatrix = number[]; // length 20

export const IDENTITY: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

function toAug(m: ColorMatrix): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) rows.push(m.slice(i * 5, i * 5 + 5));
  rows.push([0, 0, 0, 0, 1]);
  return rows;
}

/** Compose two matrices: the result applies `first`, then `second`. */
export function compose(second: ColorMatrix, first: ColorMatrix): ColorMatrix {
  const A = toAug(second), B = toAug(first);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      let s = 0;
      for (let k = 0; k < 5; k++) s += A[i][k] * B[k][j];
      out.push(s);
    }
  }
  return out;
}

export function composeAll(...ms: ColorMatrix[]): ColorMatrix {
  return ms.reduce((acc, m) => compose(m, acc), IDENTITY);
}

export function isIdentity(m: ColorMatrix, eps = 1e-4): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY[i]) < eps);
}

// ── Individual adjustments (each param in [-1, 1]; 0 = no change) ──

export function brightness(v: number): ColorMatrix {
  const b = v * 0.35;
  return [1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0];
}

export function exposure(v: number): ColorMatrix {
  const f = Math.pow(2, v); // stops
  return [f, 0, 0, 0, 0, 0, f, 0, 0, 0, 0, 0, f, 0, 0, 0, 0, 0, 1, 0];
}

export function contrast(v: number): ColorMatrix {
  const s = 1 + v * 0.6;
  const t = 0.5 * (1 - s);
  return [s, 0, 0, 0, t, 0, s, 0, 0, t, 0, 0, s, 0, t, 0, 0, 0, 1, 0];
}

export function saturation(v: number): ColorMatrix {
  const s = 1 + v; // v=-1 → grayscale, v=1 → 2× saturation
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  const sr = (1 - s) * lr, sg = (1 - s) * lg, sb = (1 - s) * lb;
  return [
    sr + s, sg, sb, 0, 0,
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

export function warmth(v: number): ColorMatrix {
  const w = v * 0.12; // push red up / blue down for warmer
  return [1, 0, 0, 0, w, 0, 1, 0, 0, 0, 0, 0, 1, 0, -w, 0, 0, 0, 1, 0];
}

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  warmth: number;
}

export const NO_ADJUST: Adjustments = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, warmth: 0 };

export function adjustmentsToMatrix(a: Adjustments): ColorMatrix {
  return composeAll(
    exposure(a.exposure),
    brightness(a.brightness),
    contrast(a.contrast),
    saturation(a.saturation),
    warmth(a.warmth),
  );
}

export function hasAdjustments(a: Adjustments): boolean {
  return a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.exposure !== 0 || a.warmth !== 0;
}

// ── Filter presets (a base look; user adjustments compose on top) ──

const LIFT_BLACKS: ColorMatrix = [
  1, 0, 0, 0, 0.06, 0, 1, 0, 0, 0.06, 0, 0, 1, 0, 0.06, 0, 0, 0, 1, 0,
];

export interface FilterPreset { key: string; label: string; matrix: ColorMatrix; }

export const FILTER_PRESETS: FilterPreset[] = [
  { key: 'none', label: 'Original', matrix: IDENTITY },
  { key: 'vivid', label: 'Vivid', matrix: adjustmentsToMatrix({ ...NO_ADJUST, saturation: 0.35, contrast: 0.2 }) },
  { key: 'warm', label: 'Warm', matrix: adjustmentsToMatrix({ ...NO_ADJUST, warmth: 0.5, brightness: 0.04 }) },
  { key: 'cool', label: 'Cool', matrix: adjustmentsToMatrix({ ...NO_ADJUST, warmth: -0.5 }) },
  { key: 'fade', label: 'Fade', matrix: composeAll(saturation(-0.3), LIFT_BLACKS, contrast(-0.12)) },
  { key: 'mono', label: 'Mono', matrix: saturation(-1) },
  { key: 'noir', label: 'Noir', matrix: composeAll(saturation(-1), contrast(0.4)) },
];

export function presetMatrix(key: string): ColorMatrix {
  return FILTER_PRESETS.find(p => p.key === key)?.matrix ?? IDENTITY;
}

/** The final matrix: apply the chosen preset, then the user's fine adjustments. */
export function finalMatrix(presetKey: string, adj: Adjustments): ColorMatrix {
  return compose(adjustmentsToMatrix(adj), presetMatrix(presetKey));
}
