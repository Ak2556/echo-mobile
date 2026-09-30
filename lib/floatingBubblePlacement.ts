/**
 * Where the floating mini-app bubble rests on a given screen.
 *
 * The bubble is Echo's only voice trigger (long-press), so it shows on every
 * signed-in screen. Its default spot, bottom-right above the tab bar, is free
 * only on the tab screens. Everywhere else that corner holds real controls:
 * the 2026-09-30 release audit found it covering the Calculator "+" key,
 * Shopping List's "+", World Clock's remove button, Flow's Share, Settings
 * toggles and the Delete Account row.
 *
 * So on screens whose bottom-right is not known to be free the bubble rests
 * lifted, up the right edge, clear of the bottom controls. The user's dragged
 * position is kept for the tab screens only; a drag on a lifted screen lasts
 * for that visit, so it cannot pull the tab position into a control.
 */
export const BUBBLE_SIZE = 54;

/** Tab screens whose bottom-right corner is free (Flow is not: Share lives there). */
const CORNER_FREE = new Set(['/', '/home', '/explore', '/apps', '/you', '/notifications']);

/** Fraction of screen height where the lifted bubble's top edge rests. */
export const LIFTED_FRACTION = 0.36;

export function cornerIsFree(pathname: string): boolean {
  return CORNER_FREE.has(pathname);
}

/** Default resting spot in the free corner: bottom-right, above the tab bar. */
export function cornerY(screenH: number): number {
  return screenH - BUBBLE_SIZE - 150;
}

export function liftedY(screenH: number): number {
  return Math.round(screenH * LIFTED_FRACTION);
}

/**
 * Resting y for the bubble on `pathname`. `savedY` is the user's persisted
 * drag position (negative when never dragged); it applies only where the
 * corner is free.
 */
export function restingY(pathname: string, screenH: number, savedY: number): number {
  if (!cornerIsFree(pathname)) return liftedY(screenH);
  return savedY >= 0 ? savedY : cornerY(screenH);
}

/** A finished drag is remembered only where the corner is free. */
export function shouldPersistDrag(pathname: string): boolean {
  return cornerIsFree(pathname);
}
