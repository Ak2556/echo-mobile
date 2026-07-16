import { getHabitStreak, isScheduledOn, loadHabits, todayStr } from './habits';
import { loadPomodoro, todayStats } from './pomodoro';
import { loadMemory } from './aiMemory';

// The proactive brain. Instead of waiting for the user to type, Echo opens the
// conversation with something that reflects their real day — a streak at risk,
// habits due, the target they set, the time of day. Everything here is
// deterministic and reads the local (synced) mini-app data, so the opener is
// instant and works offline. The same signals can later drive server-side
// push for at-scale reach-back; the copy logic is shared.

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface LastChat {
  title: string;
  ageDays: number;
}

export interface ProactiveContext {
  name: string;
  hour: number;
  partOfDay: PartOfDay;
  targetOutcome: string;
  habitsDueToday: number;
  habitsDoneToday: number;
  streakAtRisk: { name: string; streak: number } | null;
  bestStreak: { name: string; streak: number } | null;
  focusToday: number;
  focusGoal: number;
  /** most recent prior conversation with history (for continuity) */
  lastChat: LastChat | null;
  daysSinceLastChat: number | null;
  /** a durable fact Echo has remembered about the user */
  topMemory: string | null;
}

export interface ProactiveOpener {
  /** stable id per trigger, for cadence dedup */
  id: string;
  message: string;
  /** tappable suggested replies that start the conversation */
  chips: string[];
}

function partOfDay(h: number): PartOfDay {
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

export async function gatherProactiveContext(input: {
  name: string;
  targetOutcome: string;
  lastChat?: LastChat | null;
}): Promise<ProactiveContext> {
  const hour = new Date().getHours();
  const today = todayStr();

  let topMemory: string | null = null;
  try {
    const memories = await loadMemory();
    // Newest, most specific fact — skip trivial one-word values.
    const useful = memories.find(m => m.value && m.value.trim().length > 4);
    topMemory = useful ? useful.value.trim() : null;
  } catch { /* memory unavailable */ }

  let habitsDueToday = 0;
  let habitsDoneToday = 0;
  let streakAtRisk: ProactiveContext['streakAtRisk'] = null;
  let bestStreak: ProactiveContext['bestStreak'] = null;
  try {
    const habits = (await loadHabits()).filter(h => !h.archived);
    for (const h of habits) {
      const due = isScheduledOn(h, today);
      const done = h.completedDates.includes(today);
      if (due) { habitsDueToday++; if (done) habitsDoneToday++; }
      const streak = getHabitStreak(h);
      if (streak > (bestStreak?.streak ?? 0)) bestStreak = { name: h.name, streak };
      // A streak worth protecting: 2+ days, scheduled today, not yet done.
      if (due && !done && streak >= 2 && streak > (streakAtRisk?.streak ?? 0)) {
        streakAtRisk = { name: h.name, streak };
      }
    }
  } catch { /* habits unavailable — fall through */ }

  let focusToday = 0;
  let focusGoal = 8;
  try {
    const stats = todayStats(await loadPomodoro());
    focusToday = stats.count;
    focusGoal = stats.goal;
  } catch { /* pomodoro unavailable */ }

  const lastChat = input.lastChat ?? null;
  return {
    name: input.name,
    hour,
    partOfDay: partOfDay(hour),
    targetOutcome: input.targetOutcome.trim(),
    habitsDueToday,
    habitsDoneToday,
    streakAtRisk,
    bestStreak,
    focusToday,
    focusGoal,
    lastChat,
    daysSinceLastChat: lastChat ? lastChat.ageDays : null,
    topMemory,
  };
}

function meaningfulTitle(title: string | undefined): string | null {
  const t = (title ?? '').trim();
  if (!t || t.startsWith('New Chat') || t.startsWith('Branch')) return null;
  return t;
}

/** Choose the opener that speaks to the strongest live signal. */
export function pickProactiveOpener(ctx: ProactiveContext): ProactiveOpener {
  const who = ctx.name ? `, ${ctx.name}` : '';
  const target = ctx.targetOutcome;

  // 1. A streak on the line right now — most time-sensitive.
  if (ctx.streakAtRisk) {
    const { name, streak } = ctx.streakAtRisk;
    return {
      id: `streak:${name}`,
      message: `You're ${streak} days deep on ${name}${who} — don't let today break the chain. Knock it out now, or want me to set a reminder?`,
      chips: ['Mark it done', 'Remind me tonight', 'Plan it in'],
    };
  }

  // 2. Been away a while — reconnect, and reference what Echo remembers.
  if (ctx.daysSinceLastChat !== null && ctx.daysSinceLastChat >= 3) {
    const recall = ctx.topMemory
      ? `Last I knew, ${ctx.topMemory}. Still on that?`
      : target
        ? `Still chasing "${target}"? Where are you now?`
        : `What's been on your mind?`;
    return {
      id: 'welcome-back',
      message: `It's been ${ctx.daysSinceLastChat} days${who}. ${recall}`,
      chips: ['Catch you up', 'New focus', 'Reflect'],
    };
  }

  // 3. A recent, real conversation to pick back up — continuity.
  const lastTitle = ctx.lastChat && ctx.lastChat.ageDays <= 2 ? meaningfulTitle(ctx.lastChat.title) : null;
  if (lastTitle) {
    return {
      id: 'continue',
      message: `Last time we were working through "${lastTitle}"${who}. Want to pick that back up, or is today about something else?`,
      chips: ['Continue that', 'Plan my day', 'Draft an Echo'],
    };
  }

  if (ctx.partOfDay === 'morning') {
    const left = ctx.habitsDueToday - ctx.habitsDoneToday;
    if (left > 0) {
      return {
        id: 'morning:habits',
        message: `Morning${who}. ${left} habit${left === 1 ? '' : 's'} lined up today${target ? `, plus "${target}" to push forward` : ''}. Want to plan the first block?`,
        chips: ['Plan my day', 'Start a focus session', 'What matters most today?'],
      };
    }
    return {
      id: 'morning:plan',
      message: `Morning${who}. What's the one thing that would make today count${target ? ` toward "${target}"` : ''}?`,
      chips: ['Help me prioritise', 'Draft an Echo', 'Start a focus session'],
    };
  }

  if (ctx.partOfDay === 'evening' || ctx.partOfDay === 'night') {
    return {
      id: 'evening:reflect',
      message: ctx.focusToday > 0
        ? `${ctx.focusToday} focus session${ctx.focusToday === 1 ? '' : 's'} in today${who} — solid. Want to reflect on what worked, or set up tomorrow?`
        : `Evening${who}. How did today actually go? Two minutes of reflection now makes tomorrow sharper.`,
      chips: ['Reflect on today', 'Plan tomorrow', 'Draft an Echo'],
    };
  }

  return {
    id: 'afternoon:nudge',
    message: `Hey${who} — want a hand moving something forward${target ? ` on "${target}"` : ''}? I can plan the next step, draft something, or kick off a focus block.`,
    chips: ['Plan the next step', 'Start a focus session', 'Draft an Echo'],
  };
}

/** Turn a tapped chip into a full prompt Echo can act on. */
export function expandChip(chip: string): string {
  switch (chip) {
    case 'Mark it done': return 'I did my habit — log it and tell me what else is still open today.';
    case 'Remind me tonight': return 'Remind me to finish my habit tonight, and suggest a good time.';
    case 'Plan it in': return 'Help me fit my remaining habits into the rest of today.';
    case 'Plan my day': return 'Plan my day around my habits and target. Ask only what you need, then give me the next 3 actions.';
    case 'Start a focus session': return 'I want to start a focus block. What should I work on first, and for how long?';
    case 'What matters most today?': return 'Given my habits and target, what is the single most important thing to do today?';
    case 'Help me prioritise': return 'Help me prioritise today toward my target. Ask me what you need, then give me a short ordered list.';
    case 'Plan the next step': return 'What is the next concrete step toward my target? Keep it small and specific.';
    case 'Reflect on today': return 'Walk me through a quick reflection on today — what worked, what to change, one win.';
    case 'Plan tomorrow': return 'Help me set up tomorrow: the top 3 things and when to do them.';
    case 'Draft an Echo': return 'Help me turn a thought from today into a clear Echo people would want to respond to.';
    case 'Continue that': return "Let's pick up where we left off last time. Remind me what we were working on and what the next step is.";
    case 'Catch you up': return "A lot's happened since we last talked. Ask me a few quick questions to catch up on where I am, then suggest what to focus on.";
    case 'New focus': return 'I want to set a new focus. Help me pick the one thing that matters most right now.';
    case 'Reflect': return "Help me reflect on the last few days — what's working, what's stuck, and what to change.";
    default: return chip;
  }
}
