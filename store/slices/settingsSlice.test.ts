import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * What the feed looks like before anyone touches a setting.
 *
 * `compactFeed` is more than card padding: FeedCard gates the full-bleed hero
 * card on `!compactFeed`, drops the @username line, and cuts the body from ten
 * lines to four. So its default decides what the feed *is*, and until this file
 * existed nothing asserted it — the default was a single argument that any edit
 * could flip silently, and test/settings.test.ts only exercises the setter.
 *
 * The second test is the promise that comes with changing a default: a value a
 * user has explicitly chosen must win over it. `b()` reads through persistGet,
 * which falls back only when the key is absent, so a stored `false` and an
 * unset key are distinguishable — that distinction is the whole reason this
 * change does not override anybody.
 */

const stored = new Map<string, unknown>();

vi.mock('../persist', () => ({
  persistGet: <T,>(key: string, def: T): T => (stored.has(key) ? (stored.get(key) as T) : def),
  persistSet: (key: string, value: unknown) => { stored.set(key, value); },
  storage: {
    getString: () => undefined,
    set: () => {},
    delete: () => {},
  },
}));

import { createSettingsSlice } from './settingsSlice';

const build = () => createSettingsSlice(() => {}, () => ({}));

describe('compactFeed default', () => {
  beforeEach(() => { stored.clear(); });

  it('is on for anyone who has not chosen', () => {
    expect(build().compactFeed).toBe(true);
  });

  it('yields to an explicit choice in either direction', () => {
    stored.set('compactFeed', false);
    expect(build().compactFeed, 'a user who turned it off must stay off').toBe(false);

    stored.set('compactFeed', true);
    expect(build().compactFeed).toBe(true);
  });

  it('persists the choice when the setter runs, so it survives the default', () => {
    const slice = build();
    slice.setCompactFeed(false);
    expect(stored.get('compactFeed')).toBe(false);
    // A fresh slice must now read the stored value rather than the default.
    expect(build().compactFeed).toBe(false);
  });
});

/**
 * Glass off by default meant most people never saw the app's own material.
 *
 * `resolvePerformanceProfile` computes
 * `forceSolid = !glassTheme || dataSaver || osReduceTransparency || deviceTier === 'low'`,
 * and the solid tier renders ZERO blur layers — `LAYER_COUNT.solid` is 0, so
 * buildRamp returns an empty array and EdgeGlass paints only its wash gradient.
 * The result is a flat scrim with the feed sharp behind it, which is exactly
 * what the tab bar looked like: you could read a username straight through it.
 *
 * Turning it on does not endanger weak hardware. `deviceTier === 'low'` still
 * forces solid on its own, as do Data Saver and the OS reduce-transparency
 * setting, so the three guards that actually protect a cheap phone are
 * untouched — this only stops a capable device defaulting to the fallback
 * built for an incapable one.
 */
describe('glassTheme default', () => {
  beforeEach(() => { stored.clear(); });

  it('is on for anyone who has not chosen', () => {
    expect(build().glassTheme).toBe(true);
  });

  it('yields to an explicit choice in either direction', () => {
    stored.set('glassTheme', false);
    expect(build().glassTheme, 'someone who turned glass off must stay off').toBe(false);

    stored.set('glassTheme', true);
    expect(build().glassTheme).toBe(true);
  });

  it('persists the choice so it survives the default', () => {
    const slice = build();
    slice.setGlassTheme(false);
    expect(stored.get('glassTheme')).toBe(false);
    expect(build().glassTheme).toBe(false);
  });
});
