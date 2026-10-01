import { describe, expect, it } from 'vitest';
import { countWords } from './wordCount';

describe('countWords', () => {
  it('ignores bare Markdown syntax tokens', () => {
    // Counted 10 for this before: "#" and both "-" were words.
    expect(countWords('# QA Title\n\n**boldword** and *italicword*\n\n- itemone\n- itemtwo')).toBe(7);
  });

  it('counts numbers and numbered-list items, not their markers', () => {
    expect(countWords('1. buy 3 apples')).toBe(3);
    expect(countWords('> quoted line ---')).toBe(2);
  });

  it('handles empty text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
  });
});
