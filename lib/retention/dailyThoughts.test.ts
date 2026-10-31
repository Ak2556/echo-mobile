import { describe, it, expect } from 'vitest';
import { DAILY_THOUGHTS, dayNumber, pickThought, thoughtById, type ThemeTag } from './dailyThoughts';

const TAGS: ThemeTag[] = ['general', 'growth', 'mind', 'creativity', 'work', 'money', 'health', 'learning', 'relationships'];

// A local calendar day `i` days after `start`, built from date parts the way the app reads it.
const dayAfter = (start: Date, i: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);

describe('DAILY_THOUGHTS pool', () => {
  it('covers at least 300 days without repeating', () => {
    expect(DAILY_THOUGHTS.length).toBeGreaterThanOrEqual(300);
  });

  it('has unique ids and unique text, so a repeat cannot hide behind a new id', () => {
    expect(new Set(DAILY_THOUGHTS.map(t => t.id)).size).toBe(DAILY_THOUGHTS.length);
    expect(new Set(DAILY_THOUGHTS.map(t => t.text.toLowerCase())).size).toBe(DAILY_THOUGHTS.length);
  });

  it('keeps every thought short enough for the card and tagged with known themes', () => {
    for (const t of DAILY_THOUGHTS) {
      expect(t.text.trim().length, t.id).toBeGreaterThan(10);
      expect(t.text.length, t.id).toBeLessThanOrEqual(110);
      expect(t.tags.length, t.id).toBeGreaterThan(0);
      for (const tag of t.tags) expect(TAGS, `${t.id}: ${tag}`).toContain(tag);
    }
  });

  it('finds a thought by id for the pinned pick', () => {
    expect(thoughtById(DAILY_THOUGHTS[0].id)).toBe(DAILY_THOUGHTS[0]);
    expect(thoughtById('does-not-exist')).toBeUndefined();
  });
});

describe('pickThought', () => {
  it('never repeats within one full pass of the pool, from any start day', () => {
    const n = DAILY_THOUGHTS.length;
    for (const start of [new Date(2026, 10, 1), new Date(2026, 11, 31), new Date(2027, 1, 28), new Date(2028, 1, 29)]) {
      const ids = Array.from({ length: n }, (_, i) => pickThought({ date: dayAfter(start, i) }).id);
      expect(new Set(ids).size).toBe(n);
    }
  });

  it('shows a new thought every day for 300 days', () => {
    const start = new Date(2026, 10, 20);
    const ids = Array.from({ length: 300 }, (_, i) => pickThought({ date: dayAfter(start, i) }).id);
    expect(new Set(ids).size).toBe(300);
  });

  it('is a pure function of the day: same day, same thought, whatever the history', () => {
    const day = new Date(2026, 10, 20);
    const fresh = pickThought({ date: day });
    expect(pickThought({ date: day, seenIds: DAILY_THOUGHTS.map(t => t.id) })).toBe(fresh);
    expect(pickThought({ date: day, interests: ['music', 'money'] })).toBe(fresh);
    expect(pickThought({ date: new Date(2026, 10, 20, 23, 59) })).toBe(fresh);
  });

  it('changes the thought from one day to the next', () => {
    const start = new Date(2026, 10, 20);
    for (let i = 0; i < 400; i++) {
      expect(pickThought({ date: dayAfter(start, i) }).id).not.toBe(pickThought({ date: dayAfter(start, i + 1) }).id);
    }
  });

  it('does not walk down one theme: neighbouring days use different primary themes', () => {
    const start = new Date(2026, 10, 20);
    let sameTheme = 0;
    for (let i = 0; i < 299; i++) {
      if (pickThought({ date: dayAfter(start, i) }).tags[0] === pickThought({ date: dayAfter(start, i + 1) }).tags[0]) sameTheme++;
    }
    expect(sameTheme).toBeLessThan(30);
  });

  it('handles days before 1970 without a negative index', () => {
    const d = new Date(1969, 5, 1);
    expect(dayNumber(d)).toBeLessThan(0);
    expect(DAILY_THOUGHTS).toContain(pickThought({ date: d }));
  });
});
