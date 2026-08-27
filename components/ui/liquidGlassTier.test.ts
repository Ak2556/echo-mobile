import { describe, expect, it } from 'vitest';
import { resolveSurface } from './liquidGlassTier';

describe('resolveSurface', () => {
  it('takes the shader when the profile allows it and Skia is present', () => {
    expect(resolveSurface('shader', true)).toBe('shader');
  });

  it('falls back to blur when Skia is missing from this binary', () => {
    // The OTA case: the JS asks for a shader, the installed app has no Skia.
    expect(resolveSurface('shader', false)).toBe('blur');
  });

  it('never promotes above what the profile allows', () => {
    expect(resolveSurface('blur', true)).toBe('blur');
    expect(resolveSurface('solid', true)).toBe('solid');
  });

  it('honours a ceiling imposed by the call site', () => {
    expect(resolveSurface('shader', true, 'blur')).toBe('blur');
    expect(resolveSurface('shader', true, 'solid')).toBe('solid');
  });

  it('leaves solid alone when Skia is missing', () => {
    // Absent Skia must not accidentally raise a surface off the cheapest path.
    expect(resolveSurface('solid', false)).toBe('solid');
    expect(resolveSurface('blur', false)).toBe('blur');
  });

  it('takes the lower of profile and ceiling, in either order', () => {
    expect(resolveSurface('blur', true, 'shader')).toBe('blur');
    expect(resolveSurface('shader', true, 'blur')).toBe('blur');
  });
});
