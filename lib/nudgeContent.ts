/**
 * Pure content selection for personalized nudges. Kept free of any native
 * imports (expo-notifications, MMKV) so the copy-selection logic is unit-
 * testable in isolation. lib/personalNudges wires this to scheduling.
 */

import { type EngagementModel, type Surface, topSurface } from './engagementModel';

/** Live, best-effort signals gathered at schedule time to pick nudge content. */
export interface NudgeSignals {
  dailyUnanswered?: boolean;
  streakAtRisk?: { name: string; streak: number } | null;
  unreadDMs?: number;
  newFollowers?: number;
}

export interface PlannedNudge {
  hour: number;
  surface: Surface | 'chat';
  title: string;
  body: string;
}

// Interest-based fallback lines, keyed by the surface the user opens most.
const SURFACE_LINES: Record<string, { title: string; body: string }> = {
  dm: { title: 'Echo', body: 'Someone might be waiting on a reply — pick a conversation back up?' },
  daily: { title: 'Daily Question', body: "Today's question is live. Two minutes to add your take." },
  feed: { title: 'Echo', body: 'Fresh thinking landed in your feed since you last looked.' },
  chat: { title: 'Echo', body: 'Want to think something through? Echo is ready when you are.' },
  tools: { title: 'Echo', body: 'A minute to move one thing forward? Your tools are a tap away.' },
  marketplace: { title: 'Marketplace', body: 'New listings dropped in the marketplace — worth a look?' },
  profile: { title: 'Echo', body: 'See who engaged with your work today.' },
};

/**
 * Choose the content for each planned hour. A strong live signal wins the first
 * slots (most compelling first); remaining slots fall back to the user's top
 * interest, or the AI chat when there's no signal at all.
 */
export function buildPlannedNudges(
  model: EngagementModel,
  signals: NudgeSignals,
  hours: number[],
): PlannedNudge[] {
  const interest = topSurface(model) ?? 'chat';

  const priority: PlannedNudge[] = [];
  if (signals.streakAtRisk) {
    priority.push({
      hour: 0, surface: 'daily',
      title: 'Daily Question',
      body: `Your ${signals.streakAtRisk.name} streak (${signals.streakAtRisk.streak} days) is still open — finish it before the day ends?`,
    });
  } else if (signals.dailyUnanswered) {
    priority.push({
      hour: 0, surface: 'daily',
      title: 'Daily Question',
      body: "Today's question is live. Add your take before the reveal.",
    });
  }
  if (signals.unreadDMs && signals.unreadDMs > 0) {
    priority.push({
      hour: 0, surface: 'dm',
      title: 'Echo',
      body: signals.unreadDMs === 1 ? 'You have an unread message waiting.' : `You have ${signals.unreadDMs} unread messages waiting.`,
    });
  }
  if (signals.newFollowers && signals.newFollowers > 0) {
    priority.push({
      hour: 0, surface: 'profile',
      title: 'Echo',
      body: signals.newFollowers === 1 ? 'Someone new started following you.' : `${signals.newFollowers} people started following you.`,
    });
  }

  return hours.map((hour, i) => {
    const signal = priority[i];
    if (signal) return { ...signal, hour };
    const line = SURFACE_LINES[interest] ?? SURFACE_LINES.chat;
    return { hour, surface: interest, title: line.title, body: line.body };
  });
}
