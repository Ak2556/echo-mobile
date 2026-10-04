/**
 * The frame a single photo or video sits in, in a feed card.
 *
 * One rule for both, so a video tile and a photo post line up: a fixed 240pt on
 * a phone, and on an iPad held upright (where the column is ~565pt wide and 240
 * would be a 2.3:1 sliver) a 3:4 frame capped at 62% of the screen height.
 * Landscape iPad keeps the fixed height: its two columns are narrow enough.
 */

export const PHONE_MEDIA_HEIGHT = 240;

export function isTabletPortrait(width: number, height: number): boolean {
  return Math.min(width, height) >= 744 && height > width;
}

export type SingleMediaFrame =
  | { height: number }
  | { width: '100%'; aspectRatio: number; maxHeight: number };

export function singleMediaFrame(windowWidth: number, windowHeight: number, fixedHeight: number = PHONE_MEDIA_HEIGHT): SingleMediaFrame {
  return isTabletPortrait(windowWidth, windowHeight)
    ? { width: '100%', aspectRatio: 3 / 4, maxHeight: windowHeight * 0.62 }
    : { height: fixedHeight };
}
