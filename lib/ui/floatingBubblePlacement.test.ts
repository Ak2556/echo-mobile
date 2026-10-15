/**
 * M5 (2026-09-30 audit): the floating bubble, Echo's only voice trigger,
 * rested bottom-right on every screen and covered real controls wherever
 * there was no tab bar under it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUBBLE_RECEDED_OPACITY, BUBBLE_REST_OPACITY, bubbleOpacity, BUBBLE_SIZE, EDGE_MARGIN, cornerY, liftedY, restingX, restingY, shouldPersistDrag } from './floatingBubblePlacement';

// The audit device: 1344x2992 px at 3x = 448x997 pt.
const H = 997;

// Top edges of controls the bubble covered, as a fraction of screen height,
// measured on the audit screenshots.
const COVERED = {
  'calculator "+" key': 0.60,
  'shopping-list "+" add': 0.62,
  'world-clock Tokyo remove': 0.72,
  'flow Share': 0.83,
  'settings Delete Account row': 0.83,
};

describe('restingY', () => {
  it('keeps the bottom-right default on tab screens whose corner is free', () => {
    for (const p of ['/', '/home', '/explore', '/apps', '/you', '/notifications']) {
      expect(restingY(p, H, -1)).toBe(cornerY(H));
    }
  });

  it('honours the user\'s dragged position on those tabs', () => {
    expect(restingY('/home', H, 420)).toBe(420);
  });

  it('lifts on every other screen, ignoring a saved tab position', () => {
    for (const p of ['/settings', '/mini-apps/calculator', '/mini-apps/shopping-list', '/mini-apps/world-clock', '/watch', '/privacy', '/user/abc']) {
      expect(restingY(p, H, 800)).toBe(liftedY(H));
    }
  });

  it('the lifted bubble clears every control it covered in the audit', () => {
    const bottom = (liftedY(H) + BUBBLE_SIZE) / H;
    for (const [control, top] of Object.entries(COVERED)) {
      expect(bottom, `lifted bubble still reaches ${control}`).toBeLessThan(top);
    }
  });

  it('stays clear of the header', () => {
    expect(liftedY(H)).toBeGreaterThan(120);
  });
});

describe('restingX', () => {
  const W = 448;
  it('rests on the left edge on Flow, clear of its right-hand control column', () => {
    expect(restingX('/watch', W, W - 60)).toBe(EDGE_MARGIN);
  });

  it('keeps the saved side everywhere else', () => {
    expect(restingX('/settings', W, EDGE_MARGIN)).toBe(EDGE_MARGIN);
    expect(restingX('/explore', W, EDGE_MARGIN)).toBe(EDGE_MARGIN);
    expect(restingX('/explore', W, -1)).toBe(W - BUBBLE_SIZE - EDGE_MARGIN);
  });

  it('stays outside the 24 dp Back-gesture strip on both sides, by default and after a drag', () => {
    const GESTURE = 24;
    expect(EDGE_MARGIN).toBeGreaterThan(GESTURE);
    expect(restingX('/explore', W, -1) + BUBBLE_SIZE).toBeLessThan(W - GESTURE);
    expect(restingX('/explore', W, -1)).toBeGreaterThan(GESTURE);
  });

  it('moves a position saved with the old 6 pt gap clear of the strip', () => {
    expect(restingX('/explore', W, 6)).toBe(EDGE_MARGIN);
    expect(restingX('/explore', W, W - BUBBLE_SIZE - 6)).toBe(W - BUBBLE_SIZE - EDGE_MARGIN);
  });

  it('the bubble settles by EDGE_MARGIN, not a literal', () => {
    const src = readFileSync(resolve(__dirname, '../../components/mini-apps/FloatingMiniApp.tsx'), 'utf8');
    expect(src).toMatch(/SCREEN_W - BUBBLE - EDGE/);
    expect(src).not.toMatch(/\? 6 : SCREEN_W/);
  });
});

describe('shouldPersistDrag', () => {
  it('remembers drags only where the corner is free', () => {
    expect(shouldPersistDrag('/home')).toBe(true);
    expect(shouldPersistDrag('/settings')).toBe(false);
    expect(shouldPersistDrag('/mini-apps/calculator')).toBe(false);
  });
});

describe('FloatingMiniApp uses it', () => {
  const src = readFileSync(resolve(__dirname, '../../components/mini-apps/FloatingMiniApp.tsx'), 'utf8');
  it('rests by route and gates persistence', () => {
    expect(src).toMatch(/const startY = restingY\(pathname, SCREEN_H, y\)/);
    expect(src).toMatch(/if \(persistDrag\) runOnJS\(setPosition\)/);
  });
  it('still renders on every signed-in screen (it is the voice trigger)', () => {
    expect(src).not.toMatch(/bubbleAllowed|mode === 'bubble' && !/);
  });
});

describe('bubbleOpacity', () => {
  const idle = { scrolling: false, keyboardOpen: false, dragging: false };
  it('rests at 55%', () => { expect(bubbleOpacity(idle)).toBe(BUBBLE_REST_OPACITY); });
  it('recedes while the page scrolls or the keyboard is up', () => {
    expect(bubbleOpacity({ ...idle, scrolling: true })).toBe(BUBBLE_RECEDED_OPACITY);
    expect(bubbleOpacity({ ...idle, keyboardOpen: true })).toBe(BUBBLE_RECEDED_OPACITY);
  });
  it('is fully visible when held or listening, even mid-scroll', () => {
    expect(bubbleOpacity({ ...idle, dragging: true, scrolling: true })).toBe(1);
    expect(bubbleOpacity({ ...idle, listening: true, keyboardOpen: true })).toBe(1);
  });
  it('keeps the bubble at 44 pt', () => { expect(BUBBLE_SIZE).toBe(44); });
});
