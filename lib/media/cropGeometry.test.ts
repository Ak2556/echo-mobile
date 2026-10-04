import { describe, expect, it } from 'vitest';
import { clampCropRect, containFit, screenRectToImageCrop, NO_TRANSFORM } from './cropGeometry';

// A 4000×3000 photo shown in a 300×400 preview: it fits by width, so there are
// letterbox bars top and bottom.
const IMAGE = { width: 4000, height: 3000 };
const BOX = { width: 300, height: 400 };

describe('containFit', () => {
  it('fits by the tighter axis and centres the remainder', () => {
    const fit = containFit(BOX, IMAGE);
    expect(fit.scale).toBeCloseTo(300 / 4000);
    expect(fit.width).toBeCloseTo(300);
    expect(fit.height).toBeCloseTo(225);
    expect(fit.x).toBeCloseTo(0);
    expect(fit.y).toBeCloseTo((400 - 225) / 2);
  });

  it('survives a box that has not been laid out yet', () => {
    // onLayout has not fired on first render, and dividing by zero here would
    // put NaN into a crop rectangle.
    expect(containFit({ width: 0, height: 0 }, IMAGE).width).toBe(0);
    expect(containFit(BOX, { width: 0, height: 0 }).width).toBe(0);
  });
});

describe('screenRectToImageCrop', () => {
  it('maps the whole drawn image back to the whole image', () => {
    const fit = containFit(BOX, IMAGE);
    const crop = screenRectToImageCrop(
      { x: fit.x, y: fit.y, width: fit.width, height: fit.height },
      BOX, IMAGE,
    );
    expect(crop).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
  });

  it('maps a centre square to the middle of the image', () => {
    const fit = containFit(BOX, IMAGE);
    // A 150×150 box centred on the drawn image.
    const crop = screenRectToImageCrop(
      { x: fit.x + 75, y: fit.y + 37.5, width: 150, height: 150 },
      BOX, IMAGE,
    );
    expect(crop.width).toBe(2000);
    expect(crop.height).toBe(2000);
    expect(crop.x).toBe(1000);
    expect(crop.y).toBe(500);
  });

  it('accounts for the letterbox rather than treating the box as the image', () => {
    // The top-left of the *box* is above the picture. Ignoring fit.y would
    // return a negative origin and crop the wrong band of the photo.
    const crop = screenRectToImageCrop({ x: 0, y: 0, width: 150, height: 150 }, BOX, IMAGE);
    expect(crop.y).toBe(0);
    expect(crop.x).toBe(0);
  });

  it('undoes a pinch zoom', () => {
    const fit = containFit(BOX, IMAGE);
    // Zoomed 2× about the centre: the same on-screen box now covers half as
    // much of the photo in each direction.
    const rect = { x: fit.x + 75, y: fit.y + 37.5, width: 150, height: 150 };
    const plain = screenRectToImageCrop(rect, BOX, IMAGE, NO_TRANSFORM);
    const zoomed = screenRectToImageCrop(rect, BOX, IMAGE, { zoom: 2, translateX: 0, translateY: 0 });

    expect(zoomed.width).toBeCloseTo(plain.width / 2, -1);
    expect(zoomed.height).toBeCloseTo(plain.height / 2, -1);
  });

  it('undoes a drag', () => {
    const fit = containFit(BOX, IMAGE);
    const rect = { x: fit.x + 75, y: fit.y + 37.5, width: 100, height: 100 };
    const still = screenRectToImageCrop(rect, BOX, IMAGE, NO_TRANSFORM);
    // Dragging the image right means the same box now sits over pixels further
    // left in the photo.
    const dragged = screenRectToImageCrop(rect, BOX, IMAGE, { zoom: 1, translateX: 40, translateY: 0 });
    expect(dragged.x).toBeLessThan(still.x);
  });

  it('never returns a crop outside the image', () => {
    const crop = screenRectToImageCrop(
      { x: -500, y: -500, width: 5000, height: 5000 }, BOX, IMAGE,
    );
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(IMAGE.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(IMAGE.height);
  });

  it('never returns an empty crop', () => {
    // expo-image-manipulator throws on a zero-size crop, and a thrown error
    // reads to the user as "the crop button does nothing".
    const crop = screenRectToImageCrop({ x: 10, y: 10, width: 0, height: 0 }, BOX, IMAGE);
    expect(crop.width).toBeGreaterThan(0);
    expect(crop.height).toBeGreaterThan(0);
  });
});

describe('clampCropRect', () => {
  const bounds = { x: 0, y: 87.5, width: 300, height: 225 };

  it('keeps the box inside the picture', () => {
    const r = clampCropRect({ x: -50, y: 0, width: 100, height: 100 }, bounds);
    expect(r.x).toBeGreaterThanOrEqual(bounds.x);
    expect(r.y).toBeGreaterThanOrEqual(bounds.y);
    expect(r.x + r.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.001);
    expect(r.y + r.height).toBeLessThanOrEqual(bounds.y + bounds.height + 0.001);
  });

  it('refuses to shrink below a grabbable size', () => {
    const r = clampCropRect({ x: 10, y: 100, width: 2, height: 2 }, bounds, 48);
    expect(r.width).toBeGreaterThanOrEqual(48);
    expect(r.height).toBeGreaterThanOrEqual(48);
  });

  it('holds a locked aspect ratio', () => {
    const r = clampCropRect({ x: 0, y: 100, width: 200, height: 100 }, bounds, 48, 1);
    expect(r.width).toBeCloseTo(r.height);
  });

  it('does not let a locked ratio push the box out of the picture', () => {
    const r = clampCropRect({ x: 0, y: 100, width: 400, height: 400 }, bounds, 48, 1);
    expect(r.width).toBeLessThanOrEqual(bounds.width);
    expect(r.height).toBeLessThanOrEqual(bounds.height);
  });
});
