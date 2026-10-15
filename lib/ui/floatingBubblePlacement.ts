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
export const BUBBLE_SIZE = 44;

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

/**
 * Flow's right edge is a full column of controls (author + follow, like,
 * comment, save, download, share) anchored to the bottom, so its top moves
 * with screen height and no lifted y clears it everywhere. Once N2 moved that
 * column up out from under the tab bar, the lifted bubble landed on the
 * author's follow button. On Flow the bubble rests on the left edge, over
 * nothing but video.
 */
const LEFT_EDGE_ROUTES = new Set(['/watch']);
/**
 * Gap between the bubble and the screen edge, on both sides. Android's gesture navigation
 * claims roughly the outer 24 dp of each edge for Back, and a touch that starts there
 * never reaches the app: with the old 6 pt gap, half the bubble sat inside that strip, so a
 * drag or long-press started on its outer half sent the app to the launcher. 32 dp leaves
 * the whole bubble clear, with slack for a raised Back sensitivity.
 */
export const EDGE_MARGIN = 32;

/**
 * Resting x for the bubble. `savedX` is the persisted drag (negative when never dragged);
 * it is clamped inside the margins so positions saved with the old 6 pt gap move clear of
 * the gesture strip too.
 */
export function restingX(pathname: string, screenW: number, savedX: number): number {
  if (LEFT_EDGE_ROUTES.has(pathname)) return EDGE_MARGIN;
  if (savedX < 0) return screenW - BUBBLE_SIZE - EDGE_MARGIN;
  return Math.min(Math.max(savedX, EDGE_MARGIN), screenW - BUBBLE_SIZE - EDGE_MARGIN);
}

/** A finished drag is remembered only where the corner is free. */
export function shouldPersistDrag(pathname: string): boolean {
  return cornerIsFree(pathname);
}

/** What the bubble is doing, for how visible it should be. */
export interface BubbleActivity { scrolling: boolean; keyboardOpen: boolean; dragging: boolean; listening?: boolean }

/** Opacity at rest. Present, but it does not shout over the page. */
export const BUBBLE_REST_OPACITY = 0.55;
/** Opacity while something under it is moving or someone is typing. */
export const BUBBLE_RECEDED_OPACITY = 0.2;

/**
 * How visible the voice bubble is. Full while someone is holding it or it is listening, so
 * it reads as the live microphone; faint while the page scrolls or the keyboard is up, so it
 * never covers what is being read or typed; otherwise a resting 55%.
 */
export function bubbleOpacity(a: BubbleActivity): number {
  if (a.dragging || a.listening) return 1;
  if (a.scrolling || a.keyboardOpen) return BUBBLE_RECEDED_OPACITY;
  return BUBBLE_REST_OPACITY;
}
