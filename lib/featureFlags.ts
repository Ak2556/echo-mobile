/**
 * Feature flags for v1 launch scope discipline.
 *
 * For launch we hide the "Gen Z feature pack" surfaces from navigation — the
 * code stays in the repo, the screens still render if you deep-link to them,
 * but no UI affordance exposes them. Flip these to `true` post-launch (or
 * via remote config once we add it) to re-enable.
 *
 * The flags are read at module load. Toggling at runtime would require a
 * proper remote-config plumbing; for v1 a redeploy is fine.
 */

const FLAGS = {
  /** Daily-question banner on Discover + answer screen. */
  dailyQuestion: false,
  /** Salons browse, create, and individual salon feed. */
  salons: false,
  /** Office hours list + RSVP. */
  officeHours: false,
  /** Year in Echo annual recap. */
  yearInEcho: false,
  /** Gamified quests with XP progression. */
  quests: false,
  /** Achievement badges. */
  badges: false,
  /** Ephemeral 24h stories (also currently only works on local mode). */
  stories: false,
  /** Productivity mini-apps (notes, habits, expenses, voice memos, etc.). */
  miniApps: false,
  /** LiveKit-based audio rooms. */
  liveAudio: false,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag];
}

/** Convenience hook-free getters for components that just want a boolean. */
export const features = FLAGS;
