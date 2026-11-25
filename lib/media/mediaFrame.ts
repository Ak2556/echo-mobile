/**
 * The frame a single photo or video sits in, in a feed card.
 *
 * One rule for both, so a video tile and a photo post line up: a fixed 240pt on
 * a phone, and on an iPad held upright (where the column is ~565pt wide and 240
 * would be a 2.3:1 sliver) a 3:4 frame capped at 62% of the screen height.
 * Landscape iPad keeps the fixed height: its two columns are narrow enough.
 */

export const PHONE_MEDIA_HEIGHT = 240;

/**
 * Where a cropped photo is cut, as CSS object-position (expo-image follows it).
 *
 * The 240pt frame shows under half of a portrait photo, and a centred crop keeps
 * the middle: a 3:4 shot of a person lost the head and kept the chest (iPhone,
 * 2026-11-25). Faces sit in the upper third. 15% puts a point about 28% down a 3:4
 * or 9:16 photo near the frame's middle. Landscape photos barely overflow
 * vertically, so for them this is close to a centred crop.
 */
export const PHOTO_CROP_POSITION = { top: '15%', left: '50%' } as const;

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
