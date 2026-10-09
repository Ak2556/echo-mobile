import { describe, expect, it } from 'vitest';
import { ALT_TEXT_MAX, ALT_TEXT_MAX_COUNT, altForPublish, photoLabel } from './altText';

describe('altForPublish', () => {
  it('is undefined when no photo has a description', () => {
    expect(altForPublish([{}, { alt: '' }, { alt: '   ' }, { alt: null }])).toBeUndefined();
    expect(altForPublish([])).toBeUndefined();
  });

  it('keeps one entry per photo in order, blank where a photo has none', () => {
    expect(altForPublish([{ alt: ' a dog ' }, {}, { alt: 'a car' }])).toEqual(['a dog', '', 'a car']);
  });

  it('never exceeds what the database accepts', () => {
    const long = 'x'.repeat(ALT_TEXT_MAX + 50);
    expect(altForPublish([{ alt: long }])![0].length).toBe(ALT_TEXT_MAX);
    const many = Array.from({ length: ALT_TEXT_MAX_COUNT + 4 }, () => ({ alt: 'x' }));
    expect(altForPublish(many)!.length).toBe(ALT_TEXT_MAX_COUNT);
  });
});

describe('photoLabel', () => {
  it('reads the description when there is one', () => {
    expect(photoLabel('  a red car ', 1, 3)).toBe('a red car');
  });

  it('says which photo it is when there is no description', () => {
    expect(photoLabel(undefined, 0, 3)).toBe('Photo 1 / 3');
    expect(photoLabel('', 2, 3)).toBe('Photo 3 / 3');
    expect(photoLabel(null, 0, 1)).toBe('Photo');
  });
});
