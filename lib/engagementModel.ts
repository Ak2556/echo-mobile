/**
 * On-device engagement model (Stage 1 of personalized notifications).
 *
 * Learns, per user, entirely on the device (no server, no profiling upload):
 *   1. WHEN they're active — a 24-slot histogram of app-open times by local
 *      hour, decayed daily so habits can drift over weeks.
 *   2. WHAT they engage with — a decayed per-surface open count (dm, daily,
 *      feed, …), so a nudge can lead with the thing this user actually opens.
 *
 * It also carries the guardrail state (nudges sent today, ignored streak) that
 * `shouldSendNudge` uses to keep notifications *fewer and sharper* — over-
 * notifying is the top uninstall driver, so personalization here means backing
 * off, not piling on.
 *
 * All functions are pure: they take a model + inputs and return a new model or
 * a derived value. Persistence lives in the caller (MMKV via store/persist).
 */

export const SURFACES = ['dm', 'daily', 'feed', 'chat', 'tools', 'marketplace', 'profile'] as const;
export type Surface = (typeof SURFACES)[number];

export interface EngagementModel {
  /** 24 decayed open-weights, indexed by local hour (0–23). */
  hours: number[];
  /** Decayed open count per surface. */
  surfaces: Record<string, number>;
  /** Day key of the last decay pass, so decay applies once per calendar day. */
  lastDecayDay: string | null;
  /** Lifetime nudge outcomes — drive dismiss back-off. */
  notifSent: number;
  notifOpened: number;
  /** Consecutive nudges sent without an open. Resets to 0 on any open. */
  ignoredStreak: number;
  /** Daily-cap bookkeeping. */
  nudgeDayKey: string | null;
  nudgeCountToday: number;
}

/** How fast old habits fade — one multiply per new day. ~0.9^14 ≈ 0.23, so
 *  roughly a two-week half-life on stale patterns. */
const DAILY_DECAY = 0.9;

export function emptyModel(): EngagementModel {
  return {
    hours: new Array(24).fill(0),
    surfaces: {},
    lastDecayDay: null,
    notifSent: 0,
    notifOpened: 0,
    ignoredStreak: 0,
    nudgeDayKey: null,
    nudgeCountToday: 0,
  };
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Apply decay once for each calendar day elapsed since the last pass. */
function withDecay(model: EngagementModel, now: Date): EngagementModel {
  const today = localDayKey(now);
  if (model.lastDecayDay === today) return model;

  let factor = DAILY_DECAY;
  if (model.lastDecayDay) {
    const prev = new Date(`${model.lastDecayDay}T00:00:00`).getTime();
    const cur = new Date(`${today}T00:00:00`).getTime();
    const gapDays = Math.max(1, Math.round((cur - prev) / 86_400_000));
    factor = Math.pow(DAILY_DECAY, Math.min(gapDays, 60)); // cap so long absences don't underflow oddly
  }

  const surfaces: Record<string, number> = {};
  for (const [k, v] of Object.entries(model.surfaces)) {
    const decayed = v * factor;
    if (decayed > 0.01) surfaces[k] = decayed;
  }
  return {
    ...model,
    hours: model.hours.map((h) => h * factor),
    surfaces,
    lastDecayDay: today,
  };
}

/**
 * Record an app open (optionally attributed to a surface). Applies daily decay
 * first, then adds weight to the current hour and surface. An open also clears
 * the ignored-nudge streak — the user came back, so the reach-back "worked"
 * enough to reset back-off.
 */
export function recordOpen(model: EngagementModel, now: Date, surface?: Surface): EngagementModel {
  const m = withDecay(model, now);
  const hours = m.hours.slice();
  hours[now.getHours()] += 1;
  const surfaces = { ...m.surfaces };
  if (surface) surfaces[surface] = (surfaces[surface] ?? 0) + 1;
  return { ...m, hours, surfaces, ignoredStreak: 0 };
}

/** Record the outcome of a nudge we sent: opened resets back-off, ignored grows it. */
export function recordNudgeSent(model: EngagementModel, now: Date): EngagementModel {
  const today = localDayKey(now);
  const sameDay = model.nudgeDayKey === today;
  return {
    ...model,
    notifSent: model.notifSent + 1,
    ignoredStreak: model.ignoredStreak + 1,
    nudgeDayKey: today,
    nudgeCountToday: sameDay ? model.nudgeCountToday + 1 : 1,
  };
}

export function recordNudgeOpened(model: EngagementModel): EngagementModel {
  return { ...model, notifOpened: model.notifOpened + 1, ignoredStreak: 0 };
}

/**
 * The user's learned active hours, best first. Falls back to sensible defaults
 * (morning + evening) until we have enough signal.
 */
export function topActiveHours(model: EngagementModel, count: number): number[] {
  const total = model.hours.reduce((a, b) => a + b, 0);
  if (total < 3) return [9, 19].slice(0, count); // not enough signal yet
  return model.hours
    .map((weight, hour) => ({ hour, weight }))
    .filter((h) => h.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((h) => h.hour)
    .sort((a, b) => a - b);
}

/** The surface this user opens most, or null if we have no signal. */
export function topSurface(model: EngagementModel): Surface | null {
  let best: Surface | null = null;
  let bestVal = 0;
  for (const [k, v] of Object.entries(model.surfaces)) {
    if (v > bestVal && (SURFACES as readonly string[]).includes(k)) {
      bestVal = v;
      best = k as Surface;
    }
  }
  return best;
}

export interface NudgePolicy {
  maxPerDay: number;
  /** Quiet window [start, end) in local hours, wrapping past midnight. */
  quietStartHour: number;
  quietEndHour: number;
  /** Once this many nudges are ignored in a row, halve the daily allowance. */
  backOffAfterIgnored: number;
}

export const DEFAULT_POLICY: NudgePolicy = {
  maxPerDay: 2,
  quietStartHour: 22,
  quietEndHour: 8,
  backOffAfterIgnored: 3,
};

/** True if `hour` falls inside the quiet window (handles the midnight wrap). */
export function isQuietHour(hour: number, policy: NudgePolicy): boolean {
  const { quietStartHour: s, quietEndHour: e } = policy;
  return s < e ? hour >= s && hour < e : hour >= s || hour < e;
}

/**
 * Gatekeeper for sending a nudge *right now*. Returns whether to send and why —
 * the reason string is for logging/telemetry, not the user.
 */
export function shouldSendNudge(
  model: EngagementModel,
  now: Date,
  policy: NudgePolicy = DEFAULT_POLICY,
): { send: boolean; reason: string } {
  if (isQuietHour(now.getHours(), policy)) return { send: false, reason: 'quiet-hours' };

  const today = localDayKey(now);
  const sentToday = model.nudgeDayKey === today ? model.nudgeCountToday : 0;
  // Back off aggressively for users who keep ignoring us.
  const cap = model.ignoredStreak >= policy.backOffAfterIgnored
    ? Math.max(1, Math.floor(policy.maxPerDay / 2))
    : policy.maxPerDay;
  if (sentToday >= cap) return { send: false, reason: 'daily-cap' };

  return { send: true, reason: 'ok' };
}

/**
 * The hours to schedule local nudges at for the coming day: the user's learned
 * active hours, minus quiet hours, capped by policy (and halved under back-off).
 */
export function plannedNudgeHours(
  model: EngagementModel,
  policy: NudgePolicy = DEFAULT_POLICY,
): number[] {
  const cap = model.ignoredStreak >= policy.backOffAfterIgnored
    ? Math.max(1, Math.floor(policy.maxPerDay / 2))
    : policy.maxPerDay;
  const hours = topActiveHours(model, 6).filter((h) => !isQuietHour(h, policy));
  const fallback = [9, 19].filter((h) => !isQuietHour(h, policy));
  return (hours.length ? hours : fallback).slice(0, cap);
}
