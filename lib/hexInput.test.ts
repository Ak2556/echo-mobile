import { describe, expect, it } from 'vitest';
import { parseHexInput } from './hexInput';

describe('parseHexInput', () => {
  it('accepts a pasted colour after the field was cleared to "#"', () => {
    // Clearing left "#", so pasting "#336699" produced "##336699" and was ignored.
    expect(parseHexInput('##336699')).toEqual({ display: '#336699', color: '#336699' });
  });

  it('accepts input with or without the hash, in any case', () => {
    expect(parseHexInput('c65f3f').color).toBe('#C65F3F');
    expect(parseHexInput('#c65f3f').color).toBe('#C65F3F');
  });

  it('expands #RGB shorthand', () => {
    expect(parseHexInput('#fff')).toEqual({ display: '#FFF', color: '#FFFFFF' });
  });

  it('waits while the input is incomplete and drops non-hex characters', () => {
    expect(parseHexInput('#33 66')).toEqual({ display: '#3366', color: null });
    expect(parseHexInput('')).toEqual({ display: '#', color: null });
  });

  it('caps at six digits', () => {
    expect(parseHexInput('#3366991').display).toBe('#336699');
  });
});
