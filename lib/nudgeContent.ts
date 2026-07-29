/**
 * Pure content selection for personalized nudges. Kept free of any native
 * imports (expo-notifications, MMKV) so the copy-selection logic is unit-
 * testable in isolation. lib/personalNudges wires this to scheduling.
 */

import { type EngagementModel, type Surface, topSurface } from './engagementModel';
import { miniAppById } from './miniAppCatalog';

/** Live, best-effort signals gathered at schedule time to pick nudge content. */
export interface NudgeSignals {
  dailyUnanswered?: boolean;
  streakAtRisk?: { name: string; streak: number } | null;
  unreadDMs?: number;
  newFollowers?: number;
  /** Mini-app ids the user actually uses, most-used/recent first. Drives the
   *  throughout-the-day nudges toward the tools they care about. */
  favoriteMiniApps?: string[];
}

export interface PlannedNudge {
  hour: number;
  surface: Surface | 'chat';
  title: string;
  body: string;
  /** Deep-link route to open on tap (e.g. a specific mini-app). */
  route?: string;
}

// Action-oriented copy per mini-app, keyed by catalog id. Anything not listed
// falls back to the app's own name + promise from the catalog.
const MINI_APP_NUDGES: Record<string, { title: string; body: string }> = {
  fitness: { title: 'Fitness', body: 'Log today’s workout or meal to keep your numbers honest.' },
  habits: { title: 'Habits', body: 'Check in on your habits before the day slips away.' },
  tasks: { title: 'Tasks', body: 'What’s the one task that moves things forward today?' },
  notes: { title: 'Notes', body: 'Capture that thought before it fades.' },
  pomodoro: { title: 'Focus', body: 'Got 25 minutes? Start a focus block now.' },
  expenses: { title: 'Money', body: 'Log today’s spending to stay on top of your budget.' },
  planner: { title: 'Planner', body: 'Map out your blocks so today has a shape.' },
  'shopping-list': { title: 'Shopping', body: 'Anything to add to your shopping list before you head out?' },
  learn: { title: 'Learn', body: 'A few minutes on your learning path adds up — continue it?' },
  'voice-memo': { title: 'Voice Memo', body: 'Record the idea before it’s gone.' },
};

function miniAppNudge(id: string): { title: string; body: string; route?: string } {
  const preset = MINI_APP_NUDGES[id];
  const app = miniAppById(id);
  if (preset) return { ...preset, route: app ? String(app.route) : undefined };
  if (app) return { title: app.name, body: `A minute in ${app.name}? ${app.promise}`, route: String(app.route) };
  return { title: 'Echo', body: SURFACE_LINES.tools.body };
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

  const favorites = signals.favoriteMiniApps ?? [];

  return hours.map((hour, i) => {
    const signal = priority[i];
    if (signal) return { ...signal, hour };
    // Fill remaining slots with nudges toward the mini-apps this user actually
    // uses (rotating across them), so the day's pings point at real tools they
    // care about rather than a generic "come back".
    if (favorites.length > 0) {
      const id = favorites[i % favorites.length];
      const n = miniAppNudge(id);
      return { hour, surface: 'tools', title: n.title, body: n.body, route: n.route };
    }
    const line = SURFACE_LINES[interest] ?? SURFACE_LINES.chat;
    return { hour, surface: interest, title: line.title, body: line.body };
  });
}
