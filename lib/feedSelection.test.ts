import { describe, it, expect } from 'vitest';
import { applyDiversity, selectWithDiversity, type SelectableItem } from './feedSelection';

const item = (
  id: string,
  authorId: string,
  score: number,
  source: SelectableItem['source'] = 'trending',
): SelectableItem => ({ id, authorId, score, source });

describe('applyDiversity', () => {
  it('caps how many echoes one author can take in a page', () => {
    const items = [
      item('a1', 'author-1', 100),
      item('a2', 'author-1', 90),
      item('a3', 'author-1', 80),
      item('b1', 'author-2', 70),
    ];
    const out = applyDiversity(items, { limit: 4, perAuthorCap: 2, explorationShare: 0 });
    expect(out.filter(i => i.authorId === 'author-1')).toHaveLength(2);
    expect(out.map(i => i.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('keeps the highest scoring items first', () => {
    const items = [item('low', 'a', 1), item('high', 'b', 99)];
    const out = applyDiversity(items, { limit: 2, perAuthorCap: 2, explorationShare: 0 });
    expect(out[0].id).toBe('high');
  });

  it('reserves a slot for exploration even when higher-scoring items could fill the page', () => {
    // More non-exploration items than the page holds, so the exploration item
    // can only appear if a slot was genuinely reserved for it.
    const items = [
      item('t1', 'a1', 100), item('t2', 'a2', 99), item('t3', 'a3', 98),
      item('t4', 'a4', 97), item('t5', 'a5', 96), item('t6', 'a6', 95),
      item('e1', 'a7', 1, 'exploration'),
    ];
    const out = applyDiversity(items, { limit: 5, perAuthorCap: 2, explorationShare: 0.2 });
    expect(out).toHaveLength(5);
    expect(out.some(i => i.source === 'exploration')).toBe(true);
    expect(out.map(i => i.id)).not.toContain('t5');
  });

  it('does not pad with exploration items that do not exist', () => {
    const items = [item('t1', 'a', 100), item('t2', 'b', 99)];
    const out = applyDiversity(items, { limit: 5, perAuthorCap: 2, explorationShare: 0.2 });
    expect(out).toHaveLength(2);
  });

  it('never returns more than the limit', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`i${i}`, `author-${i}`, 100 - i));
    expect(applyDiversity(items, { limit: 20, perAuthorCap: 2, explorationShare: 0.2 })).toHaveLength(20);
  });

  it('returns an empty array for no input', () => {
    expect(applyDiversity([], { limit: 20, perAuthorCap: 2, explorationShare: 0.2 })).toEqual([]);
  });

  it('never exceeds the limit for an out-of-range exploration share', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`i${i}`, `author-${i}`, 100 - i));
    expect(applyDiversity(items, { limit: 4, perAuthorCap: 2, explorationShare: -0.5 })).toHaveLength(4);
    expect(applyDiversity(items, { limit: 4, perAuthorCap: 2, explorationShare: 5 })).toHaveLength(4);
  });
});

describe('selectWithDiversity', () => {
  it('takes lastExamined from the deepest EXAMINED row, not the last KEPT row, when the author cap rejects a high-scoring row', () => {
    // Author "a" has four echoes; the cap only lets two through. There is no
    // other author to fill the remaining slot, so the selector must walk past
    // both rejected rows to confirm nothing else is takeable. The last thing
    // it looked at (a4, score 85) is a row the cap rejected — not a3, which
    // scores just above it and was rejected too, and not a2, which is the
    // last row actually kept.
    const items = [
      item('a1', 'author-a', 100),
      item('a2', 'author-a', 95),
      item('a3', 'author-a', 90),
      item('a4', 'author-a', 85),
    ];
    const result = selectWithDiversity(items, { limit: 3, perAuthorCap: 2, explorationShare: 0 });

    // Sanity check on the premise: the cap actually bit, so kept != examined.
    expect(result.items.map(i => i.id)).toEqual(['a1', 'a2']);

    // The mutation this guards against: if lastExamined were instead read off
    // the kept set (`result.items[result.items.length - 1]`), this would
    // report 'a2' — a real row, so a naive assertion on "is it defined" or
    // "is it one of the four items" would pass either way. Asserting the
    // exact id is what makes a kept-set implementation fail here.
    expect(result.lastExamined?.id).toBe('a4');
    expect(result.lastExamined?.id).not.toBe(result.items[result.items.length - 1].id);
    expect(result.examinedCount).toBe(4);
  });

  it('sets lastExamined to the last kept row when the cap never has to reject anything', () => {
    const items = [item('x1', 'author-1', 100), item('x2', 'author-2', 90)];
    const result = selectWithDiversity(items, { limit: 2, perAuthorCap: 2, explorationShare: 0 });
    expect(result.items.map(i => i.id)).toEqual(['x1', 'x2']);
    expect(result.lastExamined?.id).toBe('x2');
    expect(result.examinedCount).toBe(2);
  });

  it('reports null lastExamined and zero examinedCount for empty input', () => {
    const result = selectWithDiversity([], { limit: 20, perAuthorCap: 2, explorationShare: 0.2 });
    expect(result.lastExamined).toBeNull();
    expect(result.examinedCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('reports null lastExamined for a non-positive limit even with items present', () => {
    const items = [item('a1', 'author-1', 100)];
    const result = selectWithDiversity(items, { limit: 0, perAuthorCap: 2, explorationShare: 0 });
    expect(result.lastExamined).toBeNull();
    expect(result.examinedCount).toBe(0);
  });

  it('applyDiversity delegates to selectWithDiversity (same kept items)', () => {
    const items = [
      item('a1', 'author-a', 100),
      item('a2', 'author-a', 95),
      item('a3', 'author-a', 90),
      item('b1', 'author-b', 80),
    ];
    const opts = { limit: 3, perAuthorCap: 2, explorationShare: 0 };
    expect(applyDiversity(items, opts)).toEqual(selectWithDiversity(items, opts).items);
  });
});
