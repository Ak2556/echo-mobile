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

import type { PerformanceProfile } from '../../src/shared/lib/performance';

const profile: PerformanceProfile = {
  reduceMotion: false,
  useBlur: true,
  pressAnimations: true,
  listAnimations: true,
  mountAnimations: true,
  maxBlurIntensity: 100,
  surfaceTier: 'shader',
};

vi.mock('../../src/shared/lib/performance', () => ({
  usePerformanceProfile: () => profile,
}));

const { EdgeGlass } = await import('./EdgeGlass');

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

  it('stacks four blur layers on the shader tier', () => {
    const { container } = render(
      <EdgeGlass edge="top" height={90}>
        <Text>Echo</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(4);
  });

  it('drops to three on the blur tier', () => {
    profile.surfaceTier = 'blur';
    const { container } = render(
      <EdgeGlass edge="bottom" height={90}>
        <Text>Tabs</Text>
      </EdgeGlass>,
    );
    expect(blurLayers(container)).toHaveLength(3);
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
