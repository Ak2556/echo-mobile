/**
 * Turning a crop rectangle drawn on screen into a pixel rectangle in the image.
 *
 * The editor shows the photo with contentFit="contain" inside a preview box, so
 * the picture is letterboxed: there are bars on two sides and the picture is
 * scaled down to fit. On top of that the person can pinch and drag the image
 * behind the crop box. Every one of those has to be undone to say which pixels
 * they actually selected, and getting it slightly wrong crops slightly the
 * wrong thing — which looks like the editor is broken rather than misaligned.
 *
 * Kept pure so the arithmetic can be tested without a device.
 */

export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

/** How the image sits inside the preview box under contentFit="contain". */
export interface ContainFit {
  /** Screen pixels per image pixel. */
  scale: number;
  /** Top-left of the drawn image, in box coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function containFit(box: Size, image: Size): ContainFit {
  if (box.width <= 0 || box.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { scale: 1, x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    scale,
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}

/** The pinch-and-drag the viewer applied to the image behind the crop box. */
export interface ViewTransform {
  /** 1 = not zoomed. */
  zoom: number;
  /** Screen-space translation, applied about the centre of the box. */
  translateX: number;
  translateY: number;
}

export const NO_TRANSFORM: ViewTransform = { zoom: 1, translateX: 0, translateY: 0 };

/**
 * Map a crop rectangle in box coordinates to a crop in image pixels.
 *
 * The result is clamped to the image and always at least one pixel, because
 * expo-image-manipulator throws on a zero or out-of-bounds crop and a thrown
 * error here reads to the user as "the crop button does nothing" — which is
 * exactly the complaint this feature exists to answer.
 */
export function screenRectToImageCrop(
  rect: Rect,
  box: Size,
  image: Size,
  view: ViewTransform = NO_TRANSFORM,
): Rect {
  const fit = containFit(box, image);
  if (fit.width === 0) return { x: 0, y: 0, width: image.width, height: image.height };

  // Undo the pinch-zoom, which scales about the centre of the box.
  const cx = box.width / 2;
  const cy = box.height / 2;
  const zoom = view.zoom > 0 ? view.zoom : 1;

  const unzoom = (px: number, py: number) => ({
    x: (px - cx - view.translateX) / zoom + cx,
    y: (py - cy - view.translateY) / zoom + cy,
  });

  const topLeft = unzoom(rect.x, rect.y);
  const bottomRight = unzoom(rect.x + rect.width, rect.y + rect.height);

  // Then undo the letterbox and the contain scale.
  const toImage = (p: { x: number; y: number }) => ({
    x: (p.x - fit.x) / fit.scale,
    y: (p.y - fit.y) / fit.scale,
  });

  const a = toImage(topLeft);
  const b = toImage(bottomRight);

  const left = Math.round(Math.max(0, Math.min(a.x, b.x)));
  const top = Math.round(Math.max(0, Math.min(a.y, b.y)));
  const right = Math.round(Math.min(image.width, Math.max(a.x, b.x)));
  const bottom = Math.round(Math.min(image.height, Math.max(a.y, b.y)));

  return {
    x: Math.min(left, image.width - 1),
    y: Math.min(top, image.height - 1),
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Clamp a crop rectangle to the drawn image and to a minimum size, keeping an
 * aspect ratio if one is locked. Used while a handle is being dragged.
 */
export function clampCropRect(
  rect: Rect,
  bounds: Rect,
  minSize = 48,
  aspect?: number,
): Rect {
  let width = Math.max(minSize, rect.width);
  let height = Math.max(minSize, rect.height);

  if (aspect && aspect > 0) {
    // Honour the ratio, shrinking the longer side rather than growing past the
    // image and being clamped into a different shape a moment later.
    if (width / height > aspect) width = height * aspect;
    else height = width / aspect;
  }

  width = Math.min(width, bounds.width);
  height = Math.min(height, bounds.height);

  const x = Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - width);
  const y = Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - height);

  return { x, y, width, height };
}
