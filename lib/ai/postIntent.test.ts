import { describe, expect, it } from 'vitest';
import { wantsToPost } from './postIntent';

describe('wantsToPost', () => {
  it.each([
    'post this',
    'Draft a post about sleep',
    'publish it',
    'can you share that as an echo',
    'echo this',
    'turn this into an echo',
  ])('is true for %s', (t) => expect(wantsToPost(t)).toBe(true));

  it.each([
    'what is compound interest',
    'explain how vaccines work',
    'help me plan my week',
    'thanks',
    '',
  ])('is false for %s', (t) => expect(wantsToPost(t)).toBe(false));

  it('is false for empty input', () => {
    expect(wantsToPost(undefined)).toBe(false);
    expect(wantsToPost(null)).toBe(false);
  });
});
