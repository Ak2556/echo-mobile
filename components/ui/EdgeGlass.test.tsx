import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

/**
 * That EdgeGlass wires the ramp up, not that the ramp is right — the arithmetic is
 * checked in edgeGlassRamp.test.ts, where it needs no DOM.
 *
 * What is left here is the wiring worth guarding: the tier reaches the layers, the
 * native path stays off where iOS 26 glass is absent (Android and every iOS below
 * 26, which is nearly everyone), and chrome that looks wrong still beats chrome
 * that fails to render its own buttons.
 */

import type { PerformanceProfile } from '../../lib/ui/performance';

const profile: PerformanceProfile = {
  reduceMotion: false,
  useBlur: true,
  pressAnimations: true,
  listAnimations: true,
  mountAnimations: true,
  maxBlurIntensity: 100,
  surfaceTier: 'shader',
};

vi.mock('../../lib/ui/performance', () => ({
  usePerformanceProfile: () => profile,
}));

const { EdgeGlass, glassWash } = await import('./EdgeGlass');

// react-native-web drops unknown props, so the stub's data-* attributes never
// reach the DOM. testID does survive, as data-testid.
const blurLayers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="edge-glass-blur"]'));

beforeEach(() => {
  profile.surfaceTier = 'shader';
  profile.useBlur = true;
  profile.maxBlurIntensity = 100;
});

describe('EdgeGlass', () => {
  it('renders its content', () => {
    render(
      <EdgeGlass edge="top" height={90}>
        <Text>Echo</Text>
      </EdgeGlass>,
    );
    expect(screen.getByText('Echo')).toBeTruthy();
  });

  // One blur layer, not a stacked ramp (owner request 2026-10-01: a single,
  // more transparent layer).
  it('draws a single blur layer on the shader tier', () => {
    const { container } = render(
      <EdgeGlass edge="bottom" height={90}>
        <Text>Tabs</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(1);
  });

  // 2026-11-25: Home's quote read as grey text behind the wordmark through a 0.9 wash.
  it('draws the header solid, with no glass under it', () => {
    const { container } = render(
      <EdgeGlass edge="top" height={90}>
        <Text>Echo</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(0);
    expect(screen.getByText('Echo')).toBeTruthy();
  });

  it('draws a single blur layer on the blur tier', () => {
    profile.surfaceTier = 'blur';
    const { container } = render(
      <EdgeGlass edge="bottom" height={90}>
        <Text>Tabs</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(1);
  });

  it('draws no blur at all on the solid tier', () => {
    profile.surfaceTier = 'solid';
    profile.useBlur = false;
    profile.maxBlurIntensity = 0;
    const { container } = render(
      <EdgeGlass edge="bottom" height={90}>
        <Text>Tabs</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(0);
    // Reduce-transparency asked for no translucency; it must still be a tab bar.
    expect(screen.getByText('Tabs')).toBeTruthy();
  });

  it('falls back to the blur ramp when iOS 26 glass is absent', () => {
    // Android and every iOS below 26 take this path, which is nearly everyone.
    const { container } = render(
      <EdgeGlass edge="bottom" height={90}>
        <Text>Tabs</Text>
      </EdgeGlass>,
    );
    expect(container.querySelector('[data-glass-style]')).toBeNull();
    expect(blurLayers(container).length).toBeGreaterThan(0);
  });
});

describe('glassWash', () => {
  it('washes the tab bar enough that muted icons survive a dark photo', () => {
    expect(glassWash('bottom', true, false)).toBeGreaterThanOrEqual(0.5);
    expect(glassWash('bottom', true, true)).toBeGreaterThanOrEqual(0.4);
  });

  // 2026-11-27: at 0.45 a text row under the tab bar was readable between the labels.
  it('keeps text under the tab bar from reading through it', () => {
    for (const dark of [true, false]) expect(glassWash('bottom', true, dark)).toBeGreaterThanOrEqual(0.85);
  });

  it('makes the header bar solid in every theme, blurred or not', () => {
    for (const blurred of [true, false]) {
      for (const dark of [true, false]) expect(glassWash('top', blurred, dark)).toBe(1);
    }
  });

  it('keeps the tab bar nearly solid when nothing blurs', () => {
    expect(glassWash('bottom', false, true)).toBe(0.96);
  });
});
