import { Image, Platform } from 'react-native';

/**
 * Longest edge, in pixels, a photo is uploaded at.
 *
 * The picker's `quality` re-encodes but never resizes, so a phone camera's
 * 12–48 MP original went up whole: echo-media held 22 MB and 14 MB JPEGs, and
 * avatars averaged 1.9 MB for a circle drawn at 40 pt. Every viewer downloads
 * whatever was uploaded, so that size is paid once per view, not once per post.
 */
export const MAX_UPLOAD_EDGE = { post: 1600, avatar: 512 } as const;

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
export async function downscaleForUpload(uri: string, maxEdge: number): Promise<string | null> {
  if (Platform.OS === 'web' || /^https?:\/\//i.test(uri)) return null;
  const manipulator = loadManipulator();
  if (!manipulator) return null;

  try {
    const { width, height } = await Image.getSize(uri);
    const resize = resizeForUpload(width, height, maxEdge);
    if (!resize) return null;

    const image = await manipulator.ImageManipulator.manipulate(uri).resize(resize).renderAsync();
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: manipulator.SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return null;
  }
}
