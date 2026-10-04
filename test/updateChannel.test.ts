import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Website and Firebase tester APKs are built with prebuild + Gradle, not EAS,
// so nothing set a channel on them and EAS Update could not route an update to
// a single installed APK (2026-10-01). The header bakes the channel into every
// binary built from app.json; EAS builds still override it per profile.
describe('update channel', () => {
  it('every binary asks EAS Update for the production channel', () => {
    const expo = JSON.parse(readFileSync('app.json', 'utf8')).expo;
    expect(expo.updates.requestHeaders['expo-channel-name']).toBe('production');
  });
});
