import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Reverb (the short-video feed) is a core feature and has its own tab, between Explore and
 * Chat. Alerts stays off the bar; it is reached from the bell on Home.
 */
const layout = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
const home = readFileSync('app/(tabs)/home.tsx', 'utf8');

const hidden = new Set([...layout.match(/const HIDDEN_ROUTES = new Set\(\[([^\]]*)\]\)/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]));
const screens = [...layout.matchAll(/<Tabs\.Screen name="([^"]+)"/g)].map(m => m[1]);

describe('the tab bar', () => {
  it('shows six tabs on a phone, with Reverb between Explore and Chat', () => {
    const visible = screens.filter(n => !hidden.has(n));
    expect(visible).toEqual(['home', 'explore', 'watch', 'chat', 'apps', 'you']);
  });

  it('hides only Alerts (the bell) from the bar', () => {
    expect([...hidden]).toEqual(['notifications']);
  });

  it('keeps the desktop sidebar listing every destination', () => {
    expect(layout).toMatch(/const DESKTOP_ROUTES = new Set\(\[[^\]]*'watch'[^\]]*\]\)/);
  });
});

describe('Reverb', () => {
  it('has its route and its tab', () => {
    expect(existsSync('app/(tabs)/watch.tsx')).toBe(true);
    expect(layout).toMatch(/<Tabs\.Screen name="watch"/);
  });

  it('is no longer a chip on Home, and Home is not lit while you are in it', () => {
    expect(home).not.toMatch(/router\.push\('\/\(tabs\)\/watch'\)/);
    expect(layout).not.toMatch(/isLit/);
  });
});
