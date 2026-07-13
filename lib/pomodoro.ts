import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const POMODORO_KEY = 'mini:pomodoro';
export const POMODORO_ACTIVE_KEY = 'mini:pomodoro:active';

export type PomodoroMode = 'focus' | 'short' | 'long';

/** One completed focus block (breaks aren't logged — only real work counts). */
export interface FocusSession {
  id: string;
  /** what the session was for; empty = untagged */
  label: string;
  minutes: number;
  at: string;
}

export interface PomodoroSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** long break after every N focus sessions */
  longEvery: number;
  autoStartBreaks: boolean;
  /** focus sessions per day that count as a "kept" day */
  dailyGoal: number;
}

export interface PomodoroDoc {
  sessions: FocusSession[];
  settings: PomodoroSettings;
}

export interface ActivePomodoroTimer {
  mode: PomodoroMode;
  label: string;
  startedAt: string;
  endAt: string;
  totalSeconds: number;
  notificationId?: string | null;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStartBreaks: true, dailyGoal: 8,
};

const EMPTY: PomodoroDoc = { sessions: [], settings: DEFAULT_POMODORO_SETTINGS };

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

function normalize(raw: unknown): PomodoroDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY };
  const doc = raw as Partial<PomodoroDoc>;
  const s = doc.settings ?? {};
  return {
    sessions: Array.isArray(doc.sessions) ? doc.sessions.slice(0, 2000) : [],
    settings: {
      focusMin: clamp((s as PomodoroSettings).focusMin, 5, 120, 25),
      shortMin: clamp((s as PomodoroSettings).shortMin, 1, 30, 5),
      longMin: clamp((s as PomodoroSettings).longMin, 5, 60, 15),
      longEvery: clamp((s as PomodoroSettings).longEvery, 2, 8, 4),
      autoStartBreaks: (s as PomodoroSettings).autoStartBreaks !== false,
      dailyGoal: clamp((s as PomodoroSettings).dailyGoal, 1, 20, 8),
    },
  };
}

export async function loadPomodoro(): Promise<PomodoroDoc> {
  const remote = await pullMiniAppIfNewer('pomodoro');
  if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
    await AsyncStorage.setItem(POMODORO_KEY, JSON.stringify(remote));
  }
  try {
    return normalize(JSON.parse((await AsyncStorage.getItem(POMODORO_KEY)) ?? 'null'));
  } catch {
    return { ...EMPTY };
  }
}

export async function savePomodoro(doc: PomodoroDoc): Promise<void> {
  await AsyncStorage.setItem(POMODORO_KEY, JSON.stringify(doc));
  pushMiniApp('pomodoro', doc);
}

function normalizeActiveTimer(raw: unknown): ActivePomodoroTimer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const timer = raw as Partial<ActivePomodoroTimer>;
  if (timer.mode !== 'focus' && timer.mode !== 'short' && timer.mode !== 'long') return null;
  if (typeof timer.startedAt !== 'string' || Number.isNaN(Date.parse(timer.startedAt))) return null;
  if (typeof timer.endAt !== 'string' || Number.isNaN(Date.parse(timer.endAt))) return null;
  const totalSeconds = clamp(timer.totalSeconds, 1, 120 * 60, 25 * 60);
  return {
    mode: timer.mode,
    label: typeof timer.label === 'string' ? timer.label : '',
    startedAt: timer.startedAt,
    endAt: timer.endAt,
    totalSeconds,
    notificationId: typeof timer.notificationId === 'string' ? timer.notificationId : null,
  };
}

export async function loadActivePomodoroTimer(): Promise<ActivePomodoroTimer | null> {
  try {
    return normalizeActiveTimer(JSON.parse((await AsyncStorage.getItem(POMODORO_ACTIVE_KEY)) ?? 'null'));
  } catch {
    return null;
  }
}

export async function saveActivePomodoroTimer(timer: ActivePomodoroTimer): Promise<void> {
  await AsyncStorage.setItem(POMODORO_ACTIVE_KEY, JSON.stringify(timer));
}

export async function clearActivePomodoroTimer(): Promise<void> {
  await AsyncStorage.removeItem(POMODORO_ACTIVE_KEY);
}

export function remainingSecondsForActive(timer: ActivePomodoroTimer, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(timer.endAt) - now) / 1000));
}

const dayOf = (iso: string) => iso.slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

export function sessionsOn(sessions: FocusSession[], day: string): FocusSession[] {
  return sessions.filter(s => dayOf(s.at) === day);
}

export function todayStats(doc: PomodoroDoc) {
  const today = sessionsOn(doc.sessions, todayIso());
  return {
    count: today.length,
    minutes: today.reduce((sum, s) => sum + s.minutes, 0),
    goal: doc.settings.dailyGoal,
  };
}

/** Consecutive days (incl. a still-open today) hitting the daily goal. */
export function goalStreak(doc: PomodoroDoc): number {
  const byDay = new Map<string, number>();
  for (const s of doc.sessions) byDay.set(dayOf(s.at), (byDay.get(dayOf(s.at)) ?? 0) + 1);
  const today = todayIso();
  let streak = 0;
  const d = new Date(today + 'T12:00:00');
  for (let i = 0; i < 730; i++) {
    const ds = d.toISOString().slice(0, 10);
    const count = byDay.get(ds) ?? 0;
    if (count >= doc.settings.dailyGoal) streak++;
    else if (ds !== today) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Session counts for the last 7 days, oldest first, with weekday labels. */
export function weekBars(doc: PomodoroDoc): { label: string; count: number; isToday: boolean }[] {
  const byDay = new Map<string, number>();
  for (const s of doc.sessions) byDay.set(dayOf(s.at), (byDay.get(dayOf(s.at)) ?? 0) + 1);
  const out: { label: string; count: number; isToday: boolean }[] = [];
  const today = todayIso();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    out.push({
      label: d.toLocaleDateString([], { weekday: 'narrow' }),
      count: byDay.get(ds) ?? 0,
      isToday: ds === today,
    });
  }
  return out;
}

/** Most-used labels, for quick re-tagging. */
export function topLabels(doc: PomodoroDoc, limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const s of doc.sessions) {
    const l = s.label.trim();
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([l]) => l);
}
