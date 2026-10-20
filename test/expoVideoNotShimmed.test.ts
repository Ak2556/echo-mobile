import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Until 2026-10-20 metro.config.js redirected every `expo-video` import to a no-op shim, for
 * Expo Go. The redirect was unconditional, so every shipped build ran on the shim: no native
 * player (each Reverb card fell back to an HTML <video> in a WebView), and no thumbnails on
 * iOS (`createVideoPlayer` did not exist). The "expo-video player is dead" and "the native
 * player errors straight away" findings of 2026-10-04 were the shim talking.
 *
 * VideoPreview already guards its require() for a runtime without the native module, so
 * the redirect is not needed. This fails if it comes back.
 */
describe('expo-video is the real module', () => {
  it('Metro does not redirect it', () => {
    const metro = readFileSync('metro.config.js', 'utf8');
    expect(metro).not.toMatch(/moduleName\s*===\s*["']expo-video["']/);
    expect(metro).not.toMatch(/expoVideoShim/);
  });

  it('the shim is gone', () => {
    expect(existsSync('lib/core/expoVideoShim.js')).toBe(false);
  });
});
