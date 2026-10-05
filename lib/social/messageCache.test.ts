import { describe, expect, it } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { mergeMessages } from './messageCache';

type M = { id: string; createdAt: string; text?: string };
const m = (id: string, minute: number, text = id): M => ({ id, createdAt: `2026-10-05T10:${String(minute).padStart(2, '0')}:00Z`, text });
const data = (...pages: M[][]): InfiniteData<M[]> => ({ pages, pageParams: pages.map(() => undefined) });
const ids = (d: InfiniteData<M[]> | undefined) => d?.pages.map((p) => p.map((x) => x.id));

describe('mergeMessages', () => {
  it('replaces a cached message where it is (edit, receipt, reaction)', () => {
    const out = mergeMessages(data([m('a', 1), m('b', 2)], [m('z', 0)]), [m('b', 2, 'edited')]);
    expect(ids(out)).toEqual([['a', 'b'], ['z']]);
    expect(out?.pages[0][1].text).toBe('edited');
  });

  it('replaces our pending bubble with the real message, in the same place', () => {
    const out = mergeMessages(data([m('a', 1), m('pending-b', 2), m('c', 3)]), [m('b', 2)]);
    expect(ids(out)).toEqual([['a', 'b', 'c']]);
  });

  it('appends a new message to the newest page', () => {
    expect(ids(mergeMessages(data([m('a', 1)], [m('z', 0)]), [m('b', 2)]))).toEqual([['a', 'b'], ['z']]);
  });

  it('inserts by time, so an incoming message does not land after our pending reply', () => {
    const out = mergeMessages(data([m('a', 1), m('pending-mine', 5)]), [m('theirs', 3)]);
    expect(ids(out)).toEqual([['a', 'theirs', 'pending-mine']]);
  });

  it('drops a message older than everything loaded: it belongs to an unloaded page', () => {
    const out = mergeMessages(data([m('b', 5), m('c', 6)], [m('a', 4)]), [m('old', 1)]);
    expect(ids(out)).toEqual([['b', 'c'], ['a']]);
  });

  it('keeps the first message of an empty thread', () => {
    expect(ids(mergeMessages(data([]), [m('a', 1)]))).toEqual([['a']]);
  });

  it('applies several messages in one pass, and does not mutate its input', () => {
    const before = data([m('a', 1), m('b', 2)]);
    const snapshot = JSON.stringify(before);
    const out = mergeMessages(before, [m('a', 1, 'x'), m('c', 3), m('d', 4)]);
    expect(ids(out)).toEqual([['a', 'b', 'c', 'd']]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('passes through an unloaded thread or an empty event list', () => {
    expect(mergeMessages(undefined, [m('a', 1)])).toBeUndefined();
    const d = data([m('a', 1)]);
    expect(mergeMessages(d, [])).toBe(d);
  });
});
