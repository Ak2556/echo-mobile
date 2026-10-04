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
      <EdgeGlass edge="top" height={90}>
        <Text>Echo</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(1);
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
  it('keeps the bottom bar as it was', () => {
    expect(glassWash('bottom', true, false)).toBe(0.22);
    expect(glassWash('bottom', true, true)).toBe(0.18);
  });

  it('makes the header markedly more opaque than the footer', () => {
    expect(glassWash('top', true, false)).toBeGreaterThan(glassWash('bottom', true, false) * 2);
    expect(glassWash('top', true, true)).toBeGreaterThan(glassWash('bottom', true, true) * 2);
  });

  it('is nearly solid on either edge when nothing blurs', () => {
    expect(glassWash('top', false, false)).toBe(0.96);
    expect(glassWash('bottom', false, true)).toBe(0.96);
  });
});
