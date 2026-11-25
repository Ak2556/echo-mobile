/**
 * The working copy the photo editor edits.
 *
 * The iOS picker hands over a HEIC original untouched (quality only applies to
 * JPEG), and Skia cannot decode HEIC: the editor's preview waited on a decode
 * that never came and spun forever, and Done uploaded the HEIC as "image/jpeg",
 * which Android and the web cannot show (iPhone, 2026-11-25). So every photo is
 * re-encoded to JPEG on the way in, and a camera-sized original is scaled down
 * to what the editor and an upload can use.
 */

/** Longest edge of the working copy. Posts and avatars never show more. */
export const EDITOR_MAX_EDGE = 2048;

/** The resize action for expo-image-manipulator, or null when the photo already fits. */
export function editingResize(
  width: number,
  height: number,
  maxEdge: number = EDITOR_MAX_EDGE,
): { resize: { width: number } | { height: number } } | null {
  if (!(width > 0) || !(height > 0) || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } };
}
