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
    { title: 'Your DMs', body: 'Your inbox is gathering dust and mild resentment. Both fixable.' },
    { title: 'Echo', body: 'Somewhere, a typing bubble gave up on you. Revive it.' },
    { title: 'Echo', body: 'Say something clever. Or just say “lol”. We don’t judge (much).' },
  ],
  daily: [
    { title: 'Daily Question', body: 'Today’s question is spicier than usual. Two minutes, big opinions.' },
    { title: 'Daily Question', body: 'Everyone’s answering but you. Suspicious. Add your take before the reveal.' },
    { title: 'Daily Question', body: 'Have a hot take? Perfect, we have a place for exactly that.' },
    { title: 'Daily Question', body: 'Today’s question walked in and immediately started drama. Weigh in.' },
    { title: 'Daily Question', body: 'Answer now, or read everyone else’s genius later and quietly seethe.' },
    { title: 'Daily Question', body: 'Two minutes of honesty vs. a lifetime of “what would I have said?” Choose.' },
  ],
  feed: [
    { title: 'Echo', body: 'Fresh takes landed in your feed. A few are even genuinely good.' },
    { title: 'Echo', body: 'Your feed did some thinking while you were gone. Come judge it.' },
    { title: 'Echo', body: 'The feed refreshed and it has opinions. Bold ones.' },
    { title: 'Echo', body: 'New echoes dropped. Statistically one will wreck your productivity. Worth it.' },
    { title: 'Echo', body: 'Your feed is 60% brilliance, 40% chaos. Come sort them out.' },
  ],
  chat: [
    { title: 'Echo', body: 'Something rattling around your head? Think it out loud with Echo.' },
    { title: 'Echo', body: 'Stuck, curious, or just bored? Echo’s awake and weirdly helpful.' },
    { title: 'Echo', body: 'Ask Echo the question you’d never Google in front of people.' },
    { title: 'Echo', body: 'Echo doesn’t sleep and doesn’t judge. Two rare qualities. Say hi.' },
    { title: 'Echo', body: 'Brain full? Dump it on Echo and let it untangle the mess.' },
  ],
  tools: [
    { title: 'Echo', body: 'One tiny tool, one tiny win. Compounding is undefeated.' },
    { title: 'Echo', body: 'A minute of “actually doing the thing” is right here. Wild concept.' },
    { title: 'Echo', body: 'Open a tool, feel briefly on top of your life. Fleeting, but real.' },
    { title: 'Echo', body: 'Productivity is just vibes with a checkbox. Go collect one.' },
    { title: 'Echo', body: 'Your future self is quietly begging you to open one small tool.' },
  ],
  marketplace: [
    { title: 'Marketplace', body: 'New listings dropped. Window-shopping counts as a hobby, right?' },
    { title: 'Marketplace', body: 'Something good just got listed. Look now, regret never.' },
    { title: 'Marketplace', body: 'The marketplace restocked. Your willpower is officially on trial.' },
    { title: 'Marketplace', body: 'Fresh finds just appeared. Purely for research, obviously.' },
    { title: 'Marketplace', body: 'Someone’s selling exactly the thing you didn’t know you needed.' },
  ],
  profile: [
    { title: 'Echo', body: 'People have been poking around your work today. Go see who.' },
    { title: 'Echo', body: 'Your notifications have gossip. The good kind. Take a peek.' },
    { title: 'Echo', body: 'Your profile’s been getting visitors. Nosy, flattering, both.' },
    { title: 'Echo', body: 'Something’s happening on your page and you’re missing the party.' },
    { title: 'Echo', body: 'The numbers moved. Could be nothing. Could be your moment. Look.' },
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
    { title: 'Move it', body: 'The gym called. Kidding — but your streak didn’t, and it’s worried.' },
    { title: 'Fitness', body: 'Sweat now, brag later. That’s the whole deal.' },
  ],
  habits: [
    { title: 'Habits', body: 'That streak is one tap from surviving another day. No pressure. (Some pressure.)' },
    { title: 'Don’t break the chain', body: 'Your habits miss you. Clingy, but valid. Check in.' },
    { title: 'Habits', body: 'Do it before midnight turns your streak into a cautionary tale.' },
    { title: 'Don’t break the chain', body: 'An unbroken chain is a beautiful thing. Don’t be the reason it snaps.' },
    { title: 'Habits', body: 'Tiny habit, enormous smugness. Go tick the box.' },
  ],
  tasks: [
    { title: 'Tasks', body: 'You wrote it down to do it, not to admire it. Pick one and go.' },
    { title: 'One thing', body: 'Knock out the task you’ve been expertly avoiding. We both know which.' },
    { title: 'Tasks', body: 'Momentum is one checkbox away. Go be alarmingly productive.' },
    { title: 'One thing', body: 'That to-do list isn’t self-aware yet, but it’s close. Feed it a win.' },
    { title: 'Tasks', body: 'One done task buys you guilt-free scrolling later. Economics!' },
  ],
  notes: [
    { title: 'Notes', body: 'That brilliant idea from earlier is about to ghost you. Save it.' },
    { title: 'Capture it', body: 'Brains are for having ideas, not storing them. Jot it down.' },
    { title: 'Notes', body: 'Capture the thought before it joins the graveyard of forgotten genius.' },
    { title: 'Capture it', body: 'Quick — write it down before “I’ll remember” does its usual thing.' },
  ],
  pomodoro: [
    { title: 'Focus', body: '25 minutes, zero doomscrolling, one actual win. Timer’s waiting.' },
    { title: 'Deep work', body: 'Start a focus block before the internet eats your afternoon.' },
    { title: 'Focus', body: 'One pomodoro. Just one. Your attention span can handle a comeback.' },
    { title: 'Deep work', body: 'Focus mode: activate. The distractions will survive without you.' },
  ],
  expenses: [
    { title: 'Money', body: 'Log today’s spending before your budget files a missing-person report.' },
    { title: 'Money', body: 'Where did it all go? Two taps and you’ll actually, horrifyingly, know.' },
    { title: 'Money', body: 'Your wallet kept receipts — emotionally and literally. Log them.' },
    { title: 'Money', body: 'Money doesn’t vanish, it just goes unlogged. Solve the mystery.' },
  ],
  planner: [
    { title: 'Planner', body: 'A day without a plan is just vibes. Give it a shape.' },
    { title: 'Planner', body: 'Block out today before today blocks out you.' },
    { title: 'Planner', body: 'Five minutes of planning saves an hour of “wait, what was I doing?”' },
    { title: 'Planner', body: 'Give your day a spine. It’s flopping around out there.' },
  ],
  'shopping-list': [
    { title: 'Shopping', body: 'Add it now, or “remember” it dramatically in the store aisle later.' },
    { title: 'Shopping', body: 'The list is one item short and you know exactly which. Add it.' },
    { title: 'Shopping', body: 'Write it down before it becomes tomorrow’s “ugh, I forgot the—”.' },
  ],
  learn: [
    { title: 'Learn', body: 'Ten minutes on your path today, or explain it to future-you. Their choice, really.' },
    { title: 'Learn', body: 'Tiny bit of progress beats a heroic session that never happens. Continue?' },
    { title: 'Learn', body: 'Your brain’s been asking for a snack. Feed it a lesson.' },
    { title: 'Learn', body: 'Skip today and the streak forgives you. Once. Don’t test it.' },
  ],
  'voice-memo': [
    { title: 'Voice Memo', body: 'Say the idea out loud before it evaporates. We won’t judge the humming.' },
    { title: 'Voice Memo', body: 'Talk it out. Even geniuses mutter to themselves — allegedly.' },
    { title: 'Voice Memo', body: 'Record the thought now; transcribe the brilliance later.' },
  ],
};

function genericAppLines(name: string): Line[] {
  return [
    { title: name, body: `${name} is right there, quietly plotting to make your day 1% better.` },
    { title: name, body: `A minute in ${name}? Future you sends thanks and a thumbs up.` },
    { title: name, body: `${name} is open for business and mildly disappointed by your absence.` },
    { title: name, body: `Pop into ${name}. Small effort, suspicious amount of payoff.` },
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
      `${streak} days on ${name}. Snapping it now would be a genuine plot twist. Don’t.`,
      `${name}: ${streak} days strong and quietly begging you not to blow it tonight.`,
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
      'The daily question just walked in swinging. Care to respond?',
      'Everyone’s weighing in. The one missing take is suspiciously yours.',
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
        'A message is sitting in your inbox doing a sad little wait. Go get it.',
        'One message, unread, quietly judging your response time.',
      ]),
    };
  }
  return {
    title: 'Echo',
    body: pick([
      `${n} unread messages have formed a small, patient mob. Address them?`,
      `${n} unread messages are judging your response time. Prove them wrong.`,
      `${n} messages waiting. That’s not a backlog, that’s a fan base. Reply.`,
      `${n} unread. Your inbox is starting to take it personally.`,
    ]),
  };
}

function followersLine(n: number): Line {
  if (n === 1) {
    return { title: 'Echo', body: pick([
      'Someone new started following you. Excellent taste, clearly. Say hi?',
      'New follower alert. Your work is doing numbers (well, one number).',
      'A new follower appeared. Every empire starts with one loyal subject.',
      'Someone hit follow. Bold of them to trust your posting. Wave back?',
    ]) };
  }
  return { title: 'Echo', body: pick([
    `${n} people started following you. A modest fan club is forming.`,
    `${n} new followers. Whatever you did, keep doing it.`,
    `${n} people followed you. That’s a small crowd — give them a show.`,
    `${n} new followers rolled in. Your echo is echoing.`,
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
