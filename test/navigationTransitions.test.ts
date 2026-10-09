import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * How screens move, as one rule people can learn once:
 *   - going deeper pushes (the platform default: on iOS it slides in from the right and
 *     swipes back from the left edge);
 *   - a task you start and finish is a sheet that slides up;
 *   - only the flows you pass through once, and the story viewer, fade.
 *
 * The default used to be a fade for every screen, so profile, settings, followers and messages
 * faded in while the mini-apps stack slid, and a custom transition takes over from the
 * platform's interactive swipe-back on iOS.
 */
const layout = readFileSync('app/_layout.tsx', 'utf8');
const stack = layout.slice(layout.indexOf('<Stack screenOptions'), layout.indexOf('</Stack>'));

type Screen = { name: string; options: string };
const screens: Screen[] = [...stack.matchAll(/<Stack\.Screen name="([^"]+)"(?: options=\{\{([^}]*)\}\})? \/>/g)].map(m => ({ name: m[1], options: m[2] ?? '' }));

/** Flows passed through once, the first route, and the full-screen story viewer. */
const FADES = new Set(['index', 'auth', 'welcome', 'onboarding', '(tabs)', 'story']);

describe('navigation transitions', () => {
  it('finds the stack and its screens', () => {
    expect(screens.length).toBeGreaterThan(40);
  });

  it('the default for every screen is the platform push, not a fade', () => {
    const opening = stack.slice(0, stack.indexOf('>') + 1);
    expect(opening).not.toMatch(/animation/);
  });

  it('only the flows and the story viewer fade', () => {
    const fading = screens.filter(s => /animation: 'fade'/.test(s.options)).map(s => s.name).sort();
    expect(fading).toEqual([...FADES].sort());
  });

  it('screens you push into do not override the push', () => {
    const cards = screens.filter(s => /presentation: 'card'/.test(s.options));
    expect(cards.length).toBeGreaterThan(30);
    for (const s of cards) expect(s.options, s.name).not.toMatch(/animation/);
  });

  it('sheets slide up and are not faded in', () => {
    const modals = screens.filter(s => /presentation: 'modal'/.test(s.options));
    expect(modals.length).toBeGreaterThanOrEqual(8);
    for (const s of modals) expect(s.options, s.name).not.toMatch(/animation: 'fade'/);
  });

  it('the thread and the daily question push like every other detail screen', () => {
    for (const name of ['thread/[id]', 'daily-question']) {
      const s = screens.find(x => x.name === name);
      expect(s, name).toBeDefined();
      expect(s!.options, name).not.toMatch(/animation/);
    }
  });
});
