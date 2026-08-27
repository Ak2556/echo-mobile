import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Setup for the `ui` vitest project (component tests in jsdom).
 *
 * Components under test reach react-native-web, which expects a few browser APIs
 * jsdom does not implement. Each is stubbed at the narrowest useful shape rather
 * than pulling in a polyfill library.
 */

// React Native's global. Vite's `define` substitutes it inside transformed
// modules, but a bare reference evaluated in a test body still needs it to exist,
// and setup files run before any test module is imported.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

afterEach(() => {
  cleanup();
});

// react-native-web's Appearance and useColorScheme read matchMedia at import time.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Reanimated and any measurement-driven layout expect a frame scheduler.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
}
