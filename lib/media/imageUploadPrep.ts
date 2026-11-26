import { Image, Platform } from 'react-native';

/**
 * Longest edge, in pixels, a photo is uploaded at.
 *
 * The picker's `quality` re-encodes but never resizes, so a phone camera's
 * 12–48 MP original went up whole: echo-media held 22 MB and 14 MB JPEGs, and
 * avatars averaged 1.9 MB for a circle drawn at 40 pt. Every viewer downloads
 * whatever was uploaded, so that size is paid once per view, not once per post.
 *
 * Avatars were 512 until 2026-11-26. A portrait photo came out 384 px wide, and
 * tapping a profile photo opens it full screen, where 384 px stretched across a
 * 1320 px iPhone was the pixelated picture a tester reported. 1080 square is
 * about 1.2x on the widest phone and roughly 150 KB.
 */
export const MAX_UPLOAD_EDGE = { post: 1600, avatar: 1080 } as const;

/**
 * The centred square of an image, or null when it is square already.
 *
 * An avatar is only ever seen as a circle cut from the middle, so everything
 * outside that square is bytes nobody sees, and keeping it means the visible
 * part gets fewer of the pixels the size cap allows.
 */
export function centerSquareCrop(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (!(width > 0) || !(height > 0) || width === height) return null;
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

const JPEG_QUALITY = 0.8;

/** The resize that brings the longer edge down to `maxEdge`, or null when the image already fits. */
export function resizeForUpload(
  width: number,
  height: number,
  maxEdge: number,
): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.max(width, height) <= maxEdge) return null;
  // One dimension only: the manipulator derives the other from the aspect
  // ratio, so a wrong guess about orientation can never distort the image.
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/**
 * HEIC is what an iPhone shoots, and the picker passes it through untouched.
 * Android and browsers cannot show it, so it is never uploaded as-is, even when
 * it is already small enough.
 */
export function isHeicUri(uri: string): boolean {
  return /\.hei[cf](?:$|[?#])/i.test(uri);
}

type Manipulator = typeof import('expo-image-manipulator');

function loadManipulator(): Manipulator | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { return require('expo-image-manipulator') as Manipulator; } catch { return null; }
}

/**
 * A downscaled JPEG copy of a local image, or null to upload the original.
 *
 * Every failure returns null rather than throwing: a photo uploaded at full size
 * costs bandwidth, a post that fails to publish is a bug. Remote URIs are
 * already hosted, and web is left alone because its upload path never reads a
 * re-encoded file.
 */
export async function downscaleForUpload(
  uri: string,
  maxEdge: number,
  options: { square?: boolean } = {},
): Promise<string | null> {
  if (Platform.OS === 'web' || /^https?:\/\//i.test(uri)) return null;
  const manipulator = loadManipulator();
  if (!manipulator) return null;

  try {
    const size = await Image.getSize(uri);
    const crop = options.square ? centerSquareCrop(size.width, size.height) : null;
    const width = crop ? crop.width : size.width;
    const height = crop ? crop.height : size.height;
    const resize = resizeForUpload(width, height, maxEdge);
    if (!crop && !resize && !isHeicUri(uri)) return null;

    let context = manipulator.ImageManipulator.manipulate(uri);
    if (crop) context = context.crop(crop);
    if (resize) context = context.resize(resize);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: manipulator.SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return null;
  }
}
