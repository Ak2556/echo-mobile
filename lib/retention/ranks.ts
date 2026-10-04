/**
 * Rank tiers. Status only: a rank changes nothing about reach or features.
 *
 * Points are computed in Postgres (rank_breakdowns / get_my_rank in
 * supabase/migrations/20260930150000_ranks.sql). These thresholds mirror
 * rank_tier_for() there; lib/ranks.test.ts fails if the two drift.
 */

export interface RankTier {
  /** 0 … 5, as stored in profiles.rank_tier. */
  level: number;
  name: string;
  /** Points needed to reach this tier. */
  min: number;
  /** Mark colour. Readable on both the dark and light themes. */
  color: string;
}

export const RANK_TIERS: readonly RankTier[] = [
  { level: 0, name: 'Newcomer', min: 0, color: '#8A8F98' },
  { level: 1, name: 'Voice', min: 10, color: '#7FA05A' },
  { level: 2, name: 'Regular', min: 75, color: '#3E8EDE' },
  { level: 3, name: 'Contributor', min: 250, color: '#9B6BE0' },
  { level: 4, name: 'Resonant', min: 750, color: '#E08A2E' },
  { level: 5, name: 'Luminary', min: 2000, color: '#D4A017' },
];

/** How points are earned, in the order the profile card lists them. */
export const RANK_RULES: readonly { key: RankBreakdownKey; label: string; points: string }[] = [
  { key: 'posts', label: 'Publish a post', points: '+10 (3 a day)' },
  { key: 'coauthor', label: 'Co-author a post', points: '+10' },
  { key: 'comments_received', label: 'Someone comments on your post', points: '+3' },
  { key: 'reposts_received', label: 'Someone re-echoes your post', points: '+4' },
  { key: 'likes_received', label: 'Someone likes your post', points: '+1' },
  { key: 'comments_made', label: 'You comment on someone’s post', points: '+2 (10 a day)' },
];

export type RankBreakdownKey =
  | 'posts' | 'coauthor' | 'comments_received' | 'reposts_received' | 'likes_received' | 'comments_made';

export interface MyRank {
  points: number;
  lastActiveAt: string | null;
  breakdown: Record<RankBreakdownKey, number>;
}

export function tierFor(points: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) if (points >= t.min) tier = t;
  return tier;
}

export function tierByLevel(level: number | null | undefined): RankTier {
  return RANK_TIERS[Math.max(0, Math.min(RANK_TIERS.length - 1, level ?? 0))];
}

/** Progress from this tier toward the next, 0..1; null at the top tier. */
export function rankProgress(points: number): { current: RankTier; next: RankTier | null; fraction: number; toGo: number } {
  const current = tierFor(points);
  const next = RANK_TIERS[current.level + 1] ?? null;
  if (!next) return { current, next: null, fraction: 1, toGo: 0 };
  const span = next.min - current.min;
  return { current, next, fraction: Math.max(0, Math.min(1, (points - current.min) / span)), toGo: next.min - points };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Posted or commented in the last 7 days. */
export function isActiveThisWeek(lastActiveAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastActiveAt) return false;
  const t = new Date(lastActiveAt).getTime();
  return Number.isFinite(t) && now.getTime() - t <= WEEK_MS;
}
