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
