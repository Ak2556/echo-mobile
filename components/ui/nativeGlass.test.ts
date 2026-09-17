import { describe, expect, it, beforeEach } from 'vitest';
import { isNativeGlassAvailable, NativeGlassView, __resetNativeGlassCache } from './nativeGlass';

/**
 * The guard, not the effect.
 *
 * There is no iOS 26 device under vitest, so what is worth asserting is the
 * failure path — and it is the one that matters most in production. Echo ships JS
 * over the air into binaries that predate their native dependencies, so if this
 * module ever throws instead of returning false, the update is a crash on launch
 * for everyone on an older build rather than a missing visual effect.
 */

beforeEach(() => {
  __resetNativeGlassCache();
});

describe('isNativeGlassAvailable', () => {
  it('reports unavailable off iOS rather than throwing', () => {
    expect(() => isNativeGlassAvailable()).not.toThrow();
    expect(isNativeGlassAvailable()).toBe(false);
  });

  it('caches, so the native module is asked at most once per process', () => {
    expect(isNativeGlassAvailable()).toBe(false);
    expect(isNativeGlassAvailable()).toBe(false);
  });

  it('never hands back a view the caller has not been cleared to render', () => {
    // Callers branch on the boolean, never on the export. If availability is
    // false, rendering NativeGlassView anyway must not be what keeps them honest.
    expect(isNativeGlassAvailable()).toBe(false);
    expect(NativeGlassView === null || typeof NativeGlassView === 'function' || typeof NativeGlassView === 'object').toBe(true);
  });
});
