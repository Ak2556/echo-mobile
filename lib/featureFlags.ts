/**
 * Feature flags for v1 launch scope discipline.
 *
 * Some secondary surfaces stay hidden from navigation at launch. The screens
 * still render through deep links, but no primary UI affordance exposes them.
 *
 * The flags are read at module load. Toggling at runtime would require a
 * proper remote-config plumbing; for v1 a redeploy is fine.
 */

const FLAGS = {
  /** Daily-question banner on Discover + answer screen. */
  dailyQuestion: true,
  /** Salons browse, create, and individual salon feed. */
  salons: true,
  /** Office hours list + RSVP. */
  officeHours: true,
  /** Year in Echo annual recap. */
  yearInEcho: true,
  /** Quests with XP progression. */
  quests: true,
  /** Achievement badges. */
  badges: true,
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
