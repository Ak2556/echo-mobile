import { describe, expect, it } from 'vitest';
import { initialAppearance, resolveIsDark } from './appearance';

describe('resolveIsDark', () => {
  it('follows the device in system mode', () => {
    expect(resolveIsDark('system', 'dark')).toBe(true);
    expect(resolveIsDark('system', 'light')).toBe(false);
  });
  it('an explicit choice ignores the device', () => {
    expect(resolveIsDark('dark', 'light')).toBe(true);
    expect(resolveIsDark('light', 'dark')).toBe(false);
  });
  it('falls back to dark when the device scheme is unknown', () => {
    expect(resolveIsDark('system', null)).toBe(true);
    expect(resolveIsDark('system', undefined)).toBe(true);
  });
});

describe('initialAppearance', () => {
  it('defaults to system for a person who never chose', () => {
    expect(initialAppearance(null, null)).toBe('system');
  });
  it('keeps a previously stored darkMode choice', () => {
    expect(initialAppearance(null, true)).toBe('dark');
    expect(initialAppearance(null, false)).toBe('light');
  });
  it('prefers the new setting and ignores junk', () => {
    expect(initialAppearance('light', true)).toBe('light');
    expect(initialAppearance('purple', null)).toBe('system');
  });
});
