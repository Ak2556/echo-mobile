import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

/**
 * Component-level cover for the three-tier surface.
 *
 * jsdom has no Skia native binding, so these run the same path a binary published
 * before the Skia dependency would take — the OTA fallback. That is the case worth
 * guarding: it must degrade to blur and still render its content, never blank and
 * never throw.
 */

import type { PerformanceProfile } from '../../src/shared/lib/performance';

// Mutable between tests, so the type must stay wide rather than narrowing to the
// literal the initial value happens to have.
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

const { LiquidGlass } = await import('./LiquidGlass');

beforeEach(() => {
  profile.surfaceTier = 'shader';
  profile.useBlur = true;
  profile.maxBlurIntensity = 100;
});

describe('LiquidGlass', () => {
  it('renders its content on the shader tier', () => {
    render(
      <LiquidGlass>
        <Text>echo</Text>
      </LiquidGlass>,
    );
    expect(screen.getByText('echo')).toBeTruthy();
  });

  it('renders its content on the blur tier', () => {
    profile.surfaceTier = 'blur';
    render(
      <LiquidGlass>
        <Text>blurred</Text>
      </LiquidGlass>,
    );
    expect(screen.getByText('blurred')).toBeTruthy();
  });

  it('renders its content on the solid tier, with blur switched off', () => {
    profile.surfaceTier = 'solid';
    profile.useBlur = false;
    profile.maxBlurIntensity = 0;
    render(
      <LiquidGlass>
        <Text>solid</Text>
      </LiquidGlass>,
    );
    expect(screen.getByText('solid')).toBeTruthy();
  });

  it('still renders when the call site caps the tier below the profile', () => {
    render(
      <LiquidGlass maxTier="solid">
        <Text>capped</Text>
      </LiquidGlass>,
    );
    expect(screen.getByText('capped')).toBeTruthy();
  });

  it('gives the host the caller layout on the shader tier', () => {
    // The shader tier wraps the panel in a host so the Skia canvas can overlay it.
    // If the caller's style goes to the panel instead, the host has no size — which
    // is merely invisible for a caller passing absolute offsets, and total collapse
    // for one passing `flex: 1`, as the feed action buttons do.
    const { container } = render(
      <LiquidGlass style={{ flex: 1 }}>
        <Text>sized</Text>
      </LiquidGlass>,
    );
    const host = container.firstElementChild as HTMLElement;
    expect(host).toBeTruthy();
    expect(host.style.flexGrow).toBe('1');
    expect(screen.getByText('sized')).toBeTruthy();
  });

  it('survives a binary with no Skia rather than throwing', () => {
    // The whole point of the require guard. If this ever throws, an over-the-air
    // update would crash on launch for anyone on an older build.
    expect(() =>
      render(
        <LiquidGlass>
          <Text>no skia here</Text>
        </LiquidGlass>,
      ),
    ).not.toThrow();
    expect(screen.getByText('no skia here')).toBeTruthy();
  });
});
