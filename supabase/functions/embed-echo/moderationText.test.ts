import { describe, expect, it } from 'vitest';
import { moderationTextFor } from './moderationText';

describe('what a post is judged on', () => {
  it('is the title, prompt and response as before when there is no alt text', () => {
    expect(moderationTextFor({ title: 'T', prompt: 'P', response: 'R' })).toBe('T\n\nP\n\nR');
    expect(moderationTextFor({ title: null, prompt: 'P', response: '' })).toBe('P');
    expect(moderationTextFor({ title: 'T', prompt: 'P', response: 'R', media_alt: null })).toBe('T\n\nP\n\nR');
  });

  it('includes every image description, numbered and labelled', () => {
    const text = moderationTextFor({ title: 'T', prompt: 'P', response: '', media_alt: ['a dog on a beach', 'a red car'] });
    expect(text).toContain('Image description 1: a dog on a beach');
    expect(text).toContain('Image description 2: a red car');
  });

  it('skips empty and whitespace descriptions without renumbering the ones that remain wrongly', () => {
    const text = moderationTextFor({ title: null, prompt: 'P', response: '', media_alt: ['', '  ', 'only this one'] });
    expect(text).toBe('P\n\nImage description 1: only this one');
  });

  it('tolerates a null entry in the array', () => {
    expect(moderationTextFor({ title: null, prompt: 'P', response: '', media_alt: [null as unknown as string, 'x'] })).toBe('P\n\nImage description 1: x');
  });
});
