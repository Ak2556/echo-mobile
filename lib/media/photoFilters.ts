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

export function tint(v: number): ColorMatrix {
  const t = v * 0.15; // push magenta up / green down
  return [1, 0, 0, 0, t, 0, 1, 0, 0, -t, 0, 0, 1, 0, t, 0, 0, 0, 1, 0];
}

export function fade(v: number): ColorMatrix {
  const f = Math.max(0, v) * 0.2; // lift blacks up to 20%
  return [
    1 - f, 0, 0, 0, f,
    0, 1 - f, 0, 0, f,
    0, 0, 1 - f, 0, f,
    0, 0, 0, 1, 0
  ];
}

export function hue(v: number): ColorMatrix {
  const angle = v * Math.PI;
  const c = Math.cos(angle), s = Math.sin(angle);
  const lr = 0.213, lg = 0.715, lb = 0.072;
  return [
    lr + c * (1 - lr) + s * (-lr), lg + c * (-lg) + s * (-lg), lb + c * (-lb) + s * (1 - lb), 0, 0,
    lr + c * (-lr) + s * 0.143, lg + c * (1 - lg) + s * 0.140, lb + c * (-lb) + s * (-0.283), 0, 0,
    lr + c * (-lr) + s * -(1 - lr), lg + c * (-lg) + s * lg, lb + c * (1 - lb) + s * lb, 0, 0,
    0, 0, 0, 1, 0
  ];
}

export function sepia(v: number): ColorMatrix {
  const f = Math.max(0, v);
  const inv = 1 - f;
  return [
    inv + f * 0.393, f * 0.769, f * 0.189, 0, 0,
    f * 0.349, inv + f * 0.686, f * 0.168, 0, 0,
    f * 0.272, f * 0.534, inv + f * 0.131, 0, 0,
    0, 0, 0, 1, 0
  ];
}

export function redChannel(v: number): ColorMatrix {
  return [
    1 + v, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0
  ];
}

export function greenChannel(v: number): ColorMatrix {
  return [
    1, 0, 0, 0, 0,
    0, 1 + v, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0
  ];
}

export function blueChannel(v: number): ColorMatrix {
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1 + v, 0, 0,
    0, 0, 0, 1, 0
  ];
}

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  warmth: number;
  tint: number;
  fade: number;
  hue: number;
  sepia: number;
  red: number;
  green: number;
  blue: number;
  vignette: number; // Stored here, handled visually via Skia spatial overlay
}

export const NO_ADJUST: Adjustments = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, warmth: 0, tint: 0, fade: 0, hue: 0, sepia: 0, red: 0, green: 0, blue: 0, vignette: 0 };

export function adjustmentsToMatrix(a: Adjustments): ColorMatrix {
  return composeAll(
    exposure(a.exposure),
    brightness(a.brightness),
    contrast(a.contrast),
    saturation(a.saturation),
    warmth(a.warmth),
    tint(a.tint),
    fade(a.fade),
    hue(a.hue),
    sepia(a.sepia),
    redChannel(a.red),
    greenChannel(a.green),
    blueChannel(a.blue)
  );
}

export function hasAdjustments(a: Adjustments): boolean {
  return a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.exposure !== 0 || a.warmth !== 0 || a.tint !== 0 || a.fade !== 0 || a.hue !== 0 || a.sepia !== 0 || a.red !== 0 || a.green !== 0 || a.blue !== 0 || a.vignette !== 0;
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
  { key: 'dramatic', label: 'Dramatic', matrix: adjustmentsToMatrix({ ...NO_ADJUST, saturation: -0.4, contrast: 0.3, fade: 0.2 }) },
  { key: 'chrome', label: 'Chrome', matrix: adjustmentsToMatrix({ ...NO_ADJUST, saturation: 0.5, contrast: 0.25 }) },
  { key: 'process', label: 'Process', matrix: adjustmentsToMatrix({ ...NO_ADJUST, tint: 0.3, warmth: -0.2, contrast: 0.15 }) },
  { key: 'instant', label: 'Instant', matrix: adjustmentsToMatrix({ ...NO_ADJUST, fade: 0.4, warmth: 0.3, tint: 0.2, saturation: -0.1 }) },
  { key: 'vintage', label: 'Vintage', matrix: adjustmentsToMatrix({ ...NO_ADJUST, sepia: 0.7, fade: 0.3, contrast: 0.1 }) },
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
