/**
 * M5 (2026-09-30 audit): the floating bubble, Echo's only voice trigger,
 * rested bottom-right on every screen and covered real controls wherever
 * there was no tab bar under it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUBBLE_SIZE, EDGE_MARGIN, cornerY, homeCornerY, liftedY, restingX, restingY, shouldPersistDrag } from './floatingBubblePlacement';

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
    for (const p of ['/explore', '/apps', '/you', '/notifications']) {
      expect(restingY(p, H, -1)).toBe(cornerY(H));
    }
  });

  it('rests above the compose "+" on Home instead of on top of it', () => {
    // ComposeFAB top edge = H - insets.bottom - 88 - 48; worst case insets.bottom = 34.
    const fabTop = H - 34 - 88 - 48;
    for (const p of ['/home', '/']) {
      expect(restingY(p, H, -1)).toBe(homeCornerY(H));
      expect(restingY(p, H, -1) + BUBBLE_SIZE).toBeLessThan(fabTop);
    }
  });

  it('a saved drag cannot pull it back onto the "+" on Home', () => {
    expect(restingY('/home', H, cornerY(H))).toBe(homeCornerY(H));
  });

  it('honours the user\'s dragged position on those tabs', () => {
    expect(restingY('/home', H, 420)).toBe(420);
  });

  it('lifts on every other screen, ignoring a saved tab position', () => {
    for (const p of ['/settings', '/mini-apps/calculator', '/mini-apps/shopping-list', '/mini-apps/world-clock', '/watch', '/privacy', '/create-post', '/user/abc']) {
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
    expect(restingX('/settings', W, 6)).toBe(6);
    expect(restingX('/explore', W, 6)).toBe(6);
    expect(restingX('/explore', W, -1)).toBe(W - BUBBLE_SIZE - EDGE_MARGIN);
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
  const src = readFileSync(resolve(__dirname, '../components/mini-apps/FloatingMiniApp.tsx'), 'utf8');
  it('rests by route and gates persistence', () => {
    expect(src).toMatch(/const startY = restingY\(pathname, SCREEN_H, y\)/);
    expect(src).toMatch(/if \(persistDrag\) runOnJS\(setPosition\)/);
  });
  it('still renders on every signed-in screen (it is the voice trigger)', () => {
    expect(src).not.toMatch(/bubbleAllowed|mode === 'bubble' && !/);
  });
});
