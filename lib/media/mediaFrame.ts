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

/**
 * The tallest and widest shape a single feed photo is drawn at (width / height).
 * Inside these a photo shows whole; outside, it is cropped to the limit. 3:4 is
 * the phone camera's own shape, so an ordinary photo is never cut; a 9:16 screen-
 * tall shot becomes 3:4 (about 480pt on a phone) rather than filling the screen.
 * 1.91:1 is the widest a landscape gets before it turns into a sliver.
 */
export const PHOTO_ASPECT_MIN = 3 / 4;
export const PHOTO_ASPECT_MAX = 1.91;

export function clampPhotoAspect(width: number, height: number): number | undefined {
  if (!(width > 0) || !(height > 0)) return undefined;
  return Math.min(PHOTO_ASPECT_MAX, Math.max(PHOTO_ASPECT_MIN, width / height));
}

// Shapes learned when a photo loads. Nothing stores photo dimensions, so a photo's
// first card starts at the fixed height and grows once; every later render of the
// same URI (a recycled cell, the thread view) is the right shape at once.
const learnedAspects = new Map<string, number>();
const LEARNED_LIMIT = 500;

export function knownPhotoAspect(uri: string | undefined): number | undefined {
  return uri ? learnedAspects.get(uri) : undefined;
}

export function rememberPhotoAspect(uri: string, width: number, height: number): number | undefined {
  const aspect = clampPhotoAspect(width, height);
  if (aspect === undefined) return undefined;
  if (learnedAspects.size >= LEARNED_LIMIT && !learnedAspects.has(uri)) {
    const oldest = learnedAspects.keys().next().value;
    if (oldest !== undefined) learnedAspects.delete(oldest);
  }
  learnedAspects.set(uri, aspect);
  return aspect;
}

/**
 * The frame for one photo: its own clamped shape once known, so the whole photo
 * shows instead of a 240pt strip of it (a 3:4 portrait lost half, iPhone
 * 2026-11-25). An upright iPad keeps its 3:4 frame.
 */
export function singlePhotoFrame(windowWidth: number, windowHeight: number, aspect: number | undefined) {
  if (aspect === undefined || isTabletPortrait(windowWidth, windowHeight)) {
    return singleMediaFrame(windowWidth, windowHeight);
  }
  return { width: '100%' as const, aspectRatio: aspect };
}

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
