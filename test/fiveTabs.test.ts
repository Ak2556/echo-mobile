import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Six tabs became five. Reverb is a mode of Home (the full-screen video player), so it is
 * reached from a chip on Home and Home stays lit while you are in it. Its route, its links
 * (voice, notifications, deep links) and its tests are unchanged: only the tab is gone.
 */
const layout = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
const home = readFileSync('app/(tabs)/home.tsx', 'utf8');

const hidden = new Set([...layout.match(/const HIDDEN_ROUTES = new Set\(\[([^\]]*)\]\)/)![1].matchAll(/'([^']+)'/g)].map(m => m[1]));
const screens = [...layout.matchAll(/<Tabs\.Screen name="([^"]+)"/g)].map(m => m[1]);

describe('the tab bar', () => {
  it('shows five tabs on a phone', () => {
    const visible = screens.filter(n => !hidden.has(n));
    expect(visible).toEqual(['home', 'explore', 'chat', 'apps', 'you']);
  });

  it('hides Alerts (the bell) and Reverb (the chip on Home) from the bar', () => {
    expect([...hidden].sort()).toEqual(['notifications', 'watch']);
  });

  it('keeps the desktop sidebar as it was: it has room for every destination', () => {
    expect(layout).toMatch(/const DESKTOP_ROUTES = new Set\(\[[^\]]*'watch'[^\]]*\]\)/);
  });
});

describe('Reverb from Home', () => {
  it('still has its route, so every existing link keeps working', () => {
    expect(existsSync('app/(tabs)/watch.tsx')).toBe(true);
    expect(layout).toMatch(/<Tabs\.Screen name="watch"/);
  });

  it('has a chip on Home that opens it', () => {
    expect(home).toMatch(/router\.push\('\/\(tabs\)\/watch'\)/);
    expect(home).toMatch(/accessibilityLabel=\{t\('nav\.watch'\)\}/);
  });

  it('lights Home while you are in Reverb, without stopping a tap on Home from leaving it', () => {
    expect(layout).toMatch(/const isLit = isFocused \|\| \(onWatch && route\.name === 'home'\)/);
    // The tap decision still uses the real focus, or Home could not be tapped from Reverb.
    expect(layout).toMatch(/if \(!isFocused && !event\.defaultPrevented\)/);
  });
});
