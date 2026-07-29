/**
 * Pure content selection for personalized nudges. Kept free of any native
 * imports (expo-notifications, MMKV) so the copy-selection logic is unit-
 * testable in isolation. lib/personalNudges wires this to scheduling.
 *
 * Voice: creative, a little sarcastic, never corporate — a nudge should feel
 * like a witty friend, not a calendar alert. Every slot picks from a pool of
 * variants so the same line never gets stale.
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

interface Line { title: string; body: string; }

/** Pick a random variant. Isolated so scheduling stays deterministic elsewhere. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Interest pools keyed by the surface the user opens most. Each is a grab-bag of
// tones — tease, hype, warm — so repeat exposure doesn't get old.
const SURFACE_POOL: Record<string, Line[]> = {
  dm: [
    { title: 'Echo', body: 'A conversation is quietly waiting for you to be interesting. Go deliver.' },
    { title: 'Your DMs', body: 'Someone said something and now it’s marinating in unread limbo. Reply?' },
    { title: 'Echo', body: 'Leaving people on read is a personality — just not a good one. Pop back in.' },
  ],
  daily: [
    { title: 'Daily Question', body: 'Today’s question is spicier than usual. Two minutes, big opinions.' },
    { title: 'Daily Question', body: 'Everyone’s answering but you. Suspicious. Add your take before the reveal.' },
    { title: 'Daily Question', body: 'Have a hot take? Perfect, we have a place for exactly that.' },
  ],
  feed: [
    { title: 'Echo', body: 'Fresh takes landed in your feed. A few are even genuinely good.' },
    { title: 'Echo', body: 'Your feed did some thinking while you were gone. Come judge it.' },
  ],
  chat: [
    { title: 'Echo', body: 'Something rattling around your head? Think it out loud with Echo.' },
    { title: 'Echo', body: 'Stuck, curious, or just bored? Echo’s awake and weirdly helpful.' },
  ],
  tools: [
    { title: 'Echo', body: 'One tiny tool, one tiny win. Compounding is undefeated.' },
    { title: 'Echo', body: 'A minute of "actually doing the thing" is right here. Wild concept.' },
  ],
  marketplace: [
    { title: 'Marketplace', body: 'New listings dropped. Window-shopping counts as a hobby, right?' },
    { title: 'Marketplace', body: 'Something good just got listed. Look now, regret never.' },
  ],
  profile: [
    { title: 'Echo', body: 'People have been poking around your work today. Go see who.' },
    { title: 'Echo', body: 'Your notifications have gossip. The good kind. Take a peek.' },
  ],
};

function surfaceLine(surface: string): Line {
  return pick(SURFACE_POOL[surface] ?? SURFACE_POOL.chat);
}

// Playful, action-oriented copy per mini-app, keyed by catalog id. Anything not
// listed falls back to the app's own name + a couple of generic-but-warm lines.
const MINI_APP_NUDGE_POOL: Record<string, Line[]> = {
  fitness: [
    { title: 'Fitness', body: 'Your workout isn’t going to log itself. Rude, honestly.' },
    { title: 'Move it', body: '30 minutes of sweat now = insufferably smug all evening. Deal?' },
    { title: 'Fitness', body: 'Future you is doing push-ups. Present you is reading this. Close the gap.' },
  ],
  habits: [
    { title: 'Habits', body: 'That streak is one tap from surviving another day. No pressure. (Some pressure.)' },
    { title: 'Don’t break the chain', body: 'Your habits miss you. Clingy, but valid. Check in.' },
    { title: 'Habits', body: 'Do it before midnight turns your streak into a cautionary tale.' },
  ],
  tasks: [
    { title: 'Tasks', body: 'You wrote it down to do it, not to admire it. Pick one and go.' },
    { title: 'One thing', body: 'Knock out the task you’ve been expertly avoiding. We both know which.' },
    { title: 'Tasks', body: 'Momentum is one checkbox away. Go be alarmingly productive.' },
  ],
  notes: [
    { title: 'Notes', body: 'That brilliant idea from earlier is about to ghost you. Save it.' },
    { title: 'Capture it', body: 'Brains are for having ideas, not storing them. Jot it down.' },
  ],
  pomodoro: [
    { title: 'Focus', body: '25 minutes, zero doomscrolling, one actual win. Timer’s waiting.' },
    { title: 'Deep work', body: 'Start a focus block before the internet eats your afternoon.' },
  ],
  expenses: [
    { title: 'Money', body: 'Log today’s spending before your budget files a missing-person report.' },
    { title: 'Money', body: 'Where did it all go? Two taps and you’ll actually, horrifyingly, know.' },
  ],
  planner: [
    { title: 'Planner', body: 'A day without a plan is just vibes. Give it a shape.' },
    { title: 'Planner', body: 'Block out today before today blocks out you.' },
  ],
  'shopping-list': [
    { title: 'Shopping', body: 'Add it now, or "remember" it dramatically in the store aisle later.' },
  ],
  learn: [
    { title: 'Learn', body: 'Ten minutes on your path today, or explain it to future-you. Their choice, really.' },
    { title: 'Learn', body: 'Tiny bit of progress beats a heroic session that never happens. Continue?' },
  ],
  'voice-memo': [
    { title: 'Voice Memo', body: 'Say the idea out loud before it evaporates. We won’t judge the humming.' },
  ],
};

function genericAppLines(name: string): Line[] {
  return [
    { title: name, body: `${name} is right there, quietly plotting to make your day 1% better.` },
    { title: name, body: `A minute in ${name}? Future you sends thanks and a thumbs up.` },
  ];
}

function miniAppNudge(id: string): { title: string; body: string; route?: string } {
  const app = miniAppById(id);
  const pool = MINI_APP_NUDGE_POOL[id] ?? (app ? genericAppLines(app.name) : SURFACE_POOL.tools);
  const line = pick(pool);
  return { title: line.title, body: line.body, route: app ? String(app.route) : undefined };
}

// Live-signal copy. Each returns a random variant; interpolated values (names,
// counts) are always present so the nudge stays specific.
function streakLine(name: string, streak: number): Line {
  return {
    title: 'Daily Question',
    body: pick([
      `Your ${name} streak (${streak} days) is one lazy night from tragedy. Save it?`,
      `${streak} days of ${name} and you’d fumble it before bed? Bold. Don’t.`,
      `The ${name} streak is watching you procrastinate. ${streak} days. Tick tock.`,
    ]),
  };
}

function dailyLine(): Line {
  return {
    title: 'Daily Question',
    body: pick([
      'Today’s question is live and mildly provocative. Add your take before the reveal.',
      'Two minutes, one honest answer, zero regrets. Today’s question is waiting.',
      'Answer now or watch everyone else’s takes and seethe quietly. Your call.',
    ]),
  };
}

function dmLine(n: number): Line {
  if (n === 1) {
    return {
      title: 'Echo',
      body: pick([
        'You have an unread message and someone slowly losing faith in you. Reply?',
        'One unread message. It will not read itself. Tragically.',
      ]),
    };
  }
  return {
    title: 'Echo',
    body: pick([
      `${n} unread messages have formed a small, patient mob. Address them?`,
      `${n} unread messages are judging your response time. Prove them wrong.`,
    ]),
  };
}

function followersLine(n: number): Line {
  if (n === 1) {
    return { title: 'Echo', body: pick([
      'Someone new started following you. Excellent taste, clearly. Say hi?',
      'New follower alert. Your work is doing numbers (well, one number).',
    ]) };
  }
  return { title: 'Echo', body: pick([
    `${n} people started following you. A modest fan club is forming.`,
    `${n} new followers. Whatever you did, keep doing it.`,
  ]) };
}

/**
 * Choose the content for each planned hour. A strong live signal wins the first
 * slots (most compelling first); remaining slots point at the mini-apps the user
 * actually uses, or their top interest surface when there are none.
 */
export function buildPlannedNudges(
  model: EngagementModel,
  signals: NudgeSignals,
  hours: number[],
): PlannedNudge[] {
  const interest = topSurface(model) ?? 'chat';

  const priority: PlannedNudge[] = [];
  if (signals.streakAtRisk) {
    const l = streakLine(signals.streakAtRisk.name, signals.streakAtRisk.streak);
    priority.push({ hour: 0, surface: 'daily', title: l.title, body: l.body });
  } else if (signals.dailyUnanswered) {
    const l = dailyLine();
    priority.push({ hour: 0, surface: 'daily', title: l.title, body: l.body });
  }
  if (signals.unreadDMs && signals.unreadDMs > 0) {
    const l = dmLine(signals.unreadDMs);
    priority.push({ hour: 0, surface: 'dm', title: l.title, body: l.body });
  }
  if (signals.newFollowers && signals.newFollowers > 0) {
    const l = followersLine(signals.newFollowers);
    priority.push({ hour: 0, surface: 'profile', title: l.title, body: l.body });
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
    const line = surfaceLine(interest);
    return { hour, surface: interest, title: line.title, body: line.body };
  });
}
