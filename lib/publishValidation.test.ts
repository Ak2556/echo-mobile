import { describe, it, expect } from 'vitest';
import { missingPublishFields, formatMissingFields } from './echoUX';

describe('missingPublishFields', () => {
  it('reports nothing missing when all fields are present', () => {
    expect(
      missingPublishFields({ prompt: 'Why X?', title: 'My take', response: 'Because Y.' }),
    ).toEqual([]);
  });

  it('flags the empty "part worth sharing" — the field that silently blocked Post', () => {
    expect(
      missingPublishFields({ prompt: 'Why X?', title: 'My take', response: '   ' }),
    ).toEqual(['the part worth sharing']);
  });

  it('lists every missing field in display order', () => {
    expect(missingPublishFields({ prompt: '', title: '', response: '' })).toEqual([
      'the original prompt',
      'a title',
      'the part worth sharing',
    ]);
  });

  it('treats whitespace-only values as empty', () => {
    expect(
      missingPublishFields({ prompt: '\n\t ', title: 'ok', response: 'ok' }),
    ).toEqual(['the original prompt']);
  });
});

describe('formatMissingFields', () => {
  it('returns empty string for no missing fields', () => {
    expect(formatMissingFields([])).toBe('');
  });

  it('returns the single label as-is', () => {
    expect(formatMissingFields(['a title'])).toBe('a title');
  });

  it('joins two with "and"', () => {
    expect(formatMissingFields(['a title', 'the part worth sharing'])).toBe(
      'a title and the part worth sharing',
    );
  });

  it('joins three with commas and a trailing "and"', () => {
    expect(
      formatMissingFields(['the original prompt', 'a title', 'the part worth sharing']),
    ).toBe('the original prompt, a title and the part worth sharing');
  });
});
