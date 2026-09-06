/**
 * Feature flags for v1 launch scope discipline.
 *
 * Some secondary surfaces stay hidden from navigation at launch. The screens
 * still render through deep links, but no primary UI affordance exposes them.
 *
 * These are the COMPILED DEFAULTS. lib/remoteFlags.ts layers a Supabase table
 * on top of them so a feature can be turned off without a build — read flags
 * through `useFeature()` or `isFeatureEnabled()` from there, never from this
 * map directly, or the kill switch will not reach you.
 *
 * This map remains the fallback for every case where the override layer has
 * nothing to say: no row, no network, no cache, corrupt cache. That ordering is
 * deliberate — an unreachable database must leave the app exactly as it
 * shipped, not strip it of features.
 */

export const FLAGS = {
  /** Daily-question banner on Discover + answer screen. */
  dailyQuestion: true,
  /** Salons browse, create, and individual salon feed. */
  salons: false,
  /** Office hours list + RSVP. */
  officeHours: false,
  /** Year in Echo annual recap. */
  yearInEcho: false,
  /** Quests with XP progression. */
  quests: false,
  /** Achievement badges. */
  badges: false,
  /** Ephemeral 24h stories (also currently only works on local mode). */
  stories: false,
  /** Productivity mini-apps (notes, habits, expenses, voice memos, etc.). */
  miniApps: true,
  /** LiveKit-based audio rooms. */
  liveAudio: false,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag];
}

/** Convenience hook-free getters for components that just want a boolean. */
export const features = FLAGS;
