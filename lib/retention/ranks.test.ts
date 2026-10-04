import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RANK_TIERS, isActiveThisWeek, rankProgress, tierByLevel, tierFor } from './ranks';

const migration = readFileSync('supabase/migrations/20260930150000_ranks.sql', 'utf8');

describe('tiers match the database', () => {
  it('every threshold in rank_tier_for() is a tier here, at the same level', () => {
    const sqlTiers = [...migration.matchAll(/when p_points >= (\d+)\s+then (\d)/g)].map(m => ({ min: Number(m[1]), level: Number(m[2]) }));
    expect(sqlTiers).toHaveLength(RANK_TIERS.length - 1);
    for (const { min, level } of sqlTiers) {
      expect(RANK_TIERS[level].min, `tier ${level}`).toBe(min);
    }
  });
});

describe('tierFor', () => {
  it('uses the thresholds', () => {
    expect(tierFor(0).name).toBe('Newcomer');
    expect(tierFor(9).name).toBe('Newcomer');
    expect(tierFor(10).name).toBe('Voice');   // one post
    expect(tierFor(377).name).toBe('Contributor');
    expect(tierFor(5000).name).toBe('Luminary');
  });

  it('tierByLevel clamps bad stored values', () => {
    expect(tierByLevel(undefined).level).toBe(0);
    expect(tierByLevel(9).level).toBe(5);
  });
});

describe('rankProgress', () => {
  it('measures from the current tier to the next', () => {
    const p = rankProgress(42);
    expect(p.current.name).toBe('Voice');
    expect(p.next?.name).toBe('Regular');
    expect(p.toGo).toBe(33);
    expect(p.fraction).toBeCloseTo((42 - 10) / (75 - 10));
  });

  it('is full at the top tier', () => {
    expect(rankProgress(2500)).toMatchObject({ next: null, fraction: 1, toGo: 0 });
  });
});

describe('isActiveThisWeek', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  it('is true within 7 days and false after', () => {
    expect(isActiveThisWeek('2026-09-25T12:00:00Z', now)).toBe(true);
    expect(isActiveThisWeek('2026-09-20T12:00:00Z', now)).toBe(false);
    expect(isActiveThisWeek(null, now)).toBe(false);
  });
});
