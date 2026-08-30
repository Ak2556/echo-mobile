import { describe, it, expect } from 'vitest';
import { applyDiversity, type SelectableItem } from './feedSelection';

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
