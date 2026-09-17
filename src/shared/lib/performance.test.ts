import { describe, expect, it } from 'vitest';
import { resolvePerformanceProfile } from './performance';

/** The settings a user with everything switched on and capable hardware would have. */
const RICHEST = {
  reduceAnimations: false,
  dataSaver: false,
  glassTheme: true,
  deviceTier: 'high' as const,
  osReduceMotion: false,
  osReduceTransparency: false,
};

describe('resolvePerformanceProfile — surface tier', () => {
  it('gives capable hardware the shader tier', () => {
    expect(resolvePerformanceProfile('default', RICHEST).surfaceTier).toBe('shader');
  });

  it('steps a mid device down to blur', () => {
    expect(
      resolvePerformanceProfile('default', { ...RICHEST, deviceTier: 'mid' }).surfaceTier,
    ).toBe('blur');
  });

  it('gives a low-end device solid fills and no blur at all', () => {
    const p = resolvePerformanceProfile('default', { ...RICHEST, deviceTier: 'low' });
    expect(p.surfaceTier).toBe('solid');
    expect(p.useBlur).toBe(false);
    expect(p.maxBlurIntensity).toBe(0);
  });

  it('honours the OS Reduce Transparency setting over device capability', () => {
    // The whole point of the brief's fallback requirement: a system-wide preference
    // must win, even on hardware that could easily afford the effect.
    const p = resolvePerformanceProfile('default', { ...RICHEST, osReduceTransparency: true });
    expect(p.surfaceTier).toBe('solid');
    expect(p.useBlur).toBe(false);
  });

  it('honours the OS Reduce Motion setting', () => {
    expect(
      resolvePerformanceProfile('default', { ...RICHEST, osReduceMotion: true }).reduceMotion,
    ).toBe(true);
  });

  it('drops to solid when the user turns glass off in Settings', () => {
    expect(
      resolvePerformanceProfile('default', { ...RICHEST, glassTheme: false }).surfaceTier,
    ).toBe('solid');
  });

  it('drops to solid under data saver', () => {
    expect(
      resolvePerformanceProfile('default', { ...RICHEST, dataSaver: true }).surfaceTier,
    ).toBe('solid');
  });

  it('never runs a shader in a hot list, however capable the device', () => {
    // 'hot' marks surfaces rendered per row while scrolling.
    expect(resolvePerformanceProfile('hot', RICHEST).surfaceTier).toBe('blur');
  });
});

describe("resolvePerformanceProfile — the 'control' exception", () => {
  // A feed card's action buttons live inside the scrolling list, where 'hot' bans
  // the shader outright. They are 42pt controls rather than card-sized surfaces, so
  // 'control' lifts that ban — for the top tier only. Every other reason to step
  // down must still win, or the exception is a hole.

  it('shades a small control on capable hardware', () => {
    expect(resolvePerformanceProfile('control', RICHEST).surfaceTier).toBe('shader');
  });

  it('still steps a mid device down to blur', () => {
    expect(
      resolvePerformanceProfile('control', { ...RICHEST, deviceTier: 'mid' }).surfaceTier,
    ).toBe('blur');
  });

  it('still collapses a low-end device to solid', () => {
    expect(
      resolvePerformanceProfile('control', { ...RICHEST, deviceTier: 'low' }).surfaceTier,
    ).toBe('solid');
  });

  it('still obeys Reduce Motion — a shader is animated by definition', () => {
    expect(
      resolvePerformanceProfile('control', { ...RICHEST, osReduceMotion: true }).surfaceTier,
    ).toBe('blur');
  });

  it('still obeys Reduce Transparency', () => {
    expect(
      resolvePerformanceProfile('control', { ...RICHEST, osReduceTransparency: true })
        .surfaceTier,
    ).toBe('solid');
  });

  it('still obeys data saver and the glass-off setting', () => {
    expect(
      resolvePerformanceProfile('control', { ...RICHEST, dataSaver: true }).surfaceTier,
    ).toBe('solid');
    expect(
      resolvePerformanceProfile('control', { ...RICHEST, glassTheme: false }).surfaceTier,
    ).toBe('solid');
  });

  it("does not quietly widen 'hot'", () => {
    // The exception is for 'control' alone. If this ever goes green for 'hot', a
    // card-sized surface is being shaded per row mid-scroll.
    expect(resolvePerformanceProfile('hot', RICHEST).surfaceTier).toBe('blur');
  });
});

describe('resolvePerformanceProfile — existing contract', () => {
  it('keeps the pre-existing behaviour when no new signals are supplied', () => {
    // The nine existing call sites pass only these three options.
    const p = resolvePerformanceProfile('default', {
      reduceAnimations: false,
      dataSaver: false,
      glassTheme: true,
    });
    expect(p.useBlur).toBe(true);
    expect(p.maxBlurIntensity).toBe(100);
    expect(p.reduceMotion).toBe(false);
    expect(p.pressAnimations).toBe(true);
    // An unknown device must not be optimistically given a shader.
    expect(p.surfaceTier).toBe('blur');
  });

  it('still treats glass-off as the all-cheap path', () => {
    const p = resolvePerformanceProfile('default', {
      reduceAnimations: false,
      dataSaver: false,
      glassTheme: false,
    });
    expect(p.reduceMotion).toBe(true);
    expect(p.useBlur).toBe(false);
    expect(p.pressAnimations).toBe(false);
    expect(p.listAnimations).toBe(false);
    expect(p.mountAnimations).toBe(false);
    expect(p.maxBlurIntensity).toBe(0);
  });

  it('still disables animations under reduceAnimations and dataSaver', () => {
    for (const flag of ['reduceAnimations', 'dataSaver'] as const) {
      const p = resolvePerformanceProfile('default', {
        reduceAnimations: false,
        dataSaver: false,
        glassTheme: true,
        [flag]: true,
      });
      expect(p.reduceMotion).toBe(true);
      expect(p.pressAnimations).toBe(false);
    }
  });
});
