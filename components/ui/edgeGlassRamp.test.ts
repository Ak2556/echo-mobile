import { describe, expect, it } from 'vitest';
import { buildRamp, rampLayerCount } from './edgeGlassRamp';

describe('buildRamp', () => {
  it('gives the shader tier four layers and the blur tier three', () => {
    expect(buildRamp('shader', 100, 90, 120)).toHaveLength(4);
    expect(buildRamp('blur', 100, 90, 120)).toHaveLength(3);
  });

  it('draws nothing on the solid tier', () => {
    // Reduce-transparency, data saver or a low-end device. All three are the user
    // or the hardware declining translucency, and none is worth overriding.
    expect(buildRamp('solid', 100, 90, 120)).toEqual([]);
  });

  it('draws nothing when the profile has clamped intensity to zero', () => {
    expect(buildRamp('shader', 0, 90, 120)).toEqual([]);
  });

  it('reaches less far in with every layer', () => {
    const depths = buildRamp('shader', 100, 90, 120).map(l => l.depth);
    expect(depths[0]).toBe(120);
    expect(depths.every((d, i) => i === 0 || d < depths[i - 1])).toBe(true);
  });

  it('keeps the ramp in the tail, so the bar itself is at full strength', () => {
    // Every layer must cover the bar. Spreading the ramp across the whole depth
    // leaves the inner edge of the bar — where the title and the tab labels sit —
    // barely blurred, which defeats the point of having chrome there.
    const layers = buildRamp('shader', 100, 90, 120);
    expect(layers.every(l => l.depth > 90)).toBe(true);
  });

  it('never lands a layer edge on the bar boundary', () => {
    // The tint gradient changes slope there too. Two discontinuities at the same y
    // read as a drawn line, which is the artifact the whole component exists to
    // remove — it was plainly visible on Android before the layers were staggered.
    for (const cap of [undefined, 2]) {
      for (const layer of buildRamp('shader', 100, 90, 120, cap)) {
        expect(layer.depth).not.toBe(90);
      }
    }
  });

  it('collapses to a flat stack when there is no tail to fade into', () => {
    const layers = buildRamp('shader', 100, 120, 120);
    expect(layers.every(l => l.depth === 120)).toBe(true);
  });

  it('hits harder with every layer, so strength rises toward the screen edge', () => {
    // The ramp is the entire point. A uniform stack is just a thicker slab.
    const intensities = buildRamp('shader', 100, 90, 120).map(l => l.intensity);
    expect(intensities.every((v, i) => i === 0 || v > intensities[i - 1])).toBe(true);
  });

  it('never asks expo-blur for an intensity of zero', () => {
    // A zero-intensity BlurView is a backdrop pass that renders nothing — the
    // cost with none of the effect.
    for (const layer of buildRamp('shader', 4, 90, 120)) {
      expect(layer.intensity).toBeGreaterThan(0);
    }
  });

  it('honours a call-site cap', () => {
    // Android pays for each pass far more dearly than iOS does.
    expect(rampLayerCount('shader')).toBe(4);
    expect(rampLayerCount('shader', 2)).toBe(2);
    expect(buildRamp('shader', 100, 90, 120, 2)).toHaveLength(2);
  });

  it('caps to a layer count it has weights for, rather than silently drawing nothing', () => {
    expect(buildRamp('blur', 100, 90, 120, 2)).toHaveLength(2);
  });
});
