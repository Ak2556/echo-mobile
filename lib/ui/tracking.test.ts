import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { trackingFor } from './tracking';

describe('trackingFor', () => {
  it('keeps letter-spacing for Latin-script languages', () => {
    expect(trackingFor('en', -1.6)).toBe(-1.6);
    expect(trackingFor('en', 1.4)).toBe(1.4);
    expect(trackingFor('es', 0.2)).toBe(0.2);
  });

  it('drops it for Devanagari and other non-Latin scripts', () => {
    for (const code of ['hi', 'mr', 'bn', 'ta', 'ar', 'ja'] as const) {
      expect(trackingFor(code, -1.6)).toBe(0);
      expect(trackingFor(code, 1.4)).toBe(0);
    }
  });
});

// The Hindi welcome rendered "वापसा पर स्वागत ह" because of a raw negative
// letterSpacing. These screens carry headline and eyebrow tracking, so every
// value in them must go through tracking().
describe('tracking is applied on the main screens', () => {
  const files = [
    'app/(tabs)/home.tsx',
    'app/(tabs)/apps.tsx',
    'app/(tabs)/you.tsx',
    'app/(tabs)/notifications.tsx',
    'app/(tabs)/explore.tsx',
    'app/(tabs)/chat.tsx',
    'app/auth/login.tsx',
  ];
  // Latin-only numerals and the English wordmark are the allowed exceptions.
  const allowed = [/fontSize: 24, \.\.\.font\.displayBlack, letterSpacing: -0\.5/, /letterSpacing: -2 \}/];

  it.each(files)('%s has no raw non-zero letterSpacing', file => {
    const raw = readFileSync(file, 'utf8')
      .split('\n')
      .filter(line => /letterSpacing: *-?[0-9]/.test(line) && !/letterSpacing: *0[,\s}]/.test(line))
      .filter(line => !allowed.some(rx => rx.test(line)));
    expect(raw).toEqual([]);
  });
});

describe('leadingFor', () => {
  it('keeps tight leading for Latin and opens it up for Devanagari', async () => {
    const { leadingFor } = await import('./tracking');
    expect(leadingFor('en', 46, 46)).toBe(46);
    expect(leadingFor('hi', 46, 46)).toBe(64);
    expect(leadingFor('hi', 20, 32)).toBe(32);
  });
});
