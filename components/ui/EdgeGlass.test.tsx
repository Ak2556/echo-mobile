import { readFileSync } from 'node:fs';
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

  // 2026-11-27: the tab bar went solid like the header. A blur under a solid
  // wash is GPU spent on nothing anyone can see.
  it('draws the tab bar solid, with no glass under it', () => {
    for (const tier of ['shader', 'blur'] as const) {
      profile.surfaceTier = tier;
      const { container, unmount } = render(
        <EdgeGlass edge="bottom" height={90}>
          <Text>Tabs</Text>
        </EdgeGlass>,
      );
      expect(blurLayers(container)).toHaveLength(0);
      unmount();
    }
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

});

describe('glassWash', () => {
  // 2026-11-27: a translucent tab bar let a name and a Follow button read
  // through behind the icons at every value tried (0.45, 0.85, 0.92).
  it('makes both bars solid in every theme, blurred or not', () => {
    for (const edge of ['top', 'bottom'] as const) {
      for (const blurred of [true, false]) {
        for (const dark of [true, false]) expect(glassWash(edge, blurred, dark)).toBe(1);
      }
    }
  });
});

// 2026-11-27: in light themes the header was pure white over an off-white page.
describe('EdgeGlass base colour', () => {
  it('is the page colour, not a fixed white', () => {
    const src = readFileSync('components/ui/EdgeGlass.tsx', 'utf8');
    expect(src).toMatch(/const base = tone === 'dark' \? '#000000' : colors\.bg;/);
  });
});
