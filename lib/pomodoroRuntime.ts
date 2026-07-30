import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  ActivePomodoroTimer,
  PomodoroDoc,
  PomodoroMode,
  clearActivePomodoroTimer,
  loadActivePomodoroTimer,
  loadPomodoro,
  remainingSecondsForActive,
  saveActivePomodoroTimer,
  savePomodoro,
  sessionsOn,
} from './pomodoro';

export const POMODORO_CHANNEL_ID = 'pomodoro-timers';

// Witty session-transition copy. `nextMode === 'focus'` fires when a focus
// block just finished (break next); the other branch when a break ends.
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const FOCUS_DONE = [
  { title: 'Focus done 🎯', body: 'You survived a full block of real work. Go touch grass — break time.' },
  { title: 'Nailed it 🎯', body: 'Brain successfully used. Reward it with a break.' },
  { title: 'Block complete 🎯', body: 'That’s focus, baby. Break earned, no notes.' },
];
const BREAK_DONE = [
  { title: 'Break’s over ☕', body: 'The couch was lovely. Back to being brilliant.' },
  { title: 'Time’s up ☕', body: 'Snack acquired, vibes restored. Now: focus.' },
  { title: 'Back to it ☕', body: 'Rest complete. Let’s make the next block count.' },
];

let completionPromise: Promise<ActivePomodoroTimer | null> | null = null;

export async function ensurePomodoroTimerNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(POMODORO_CHANNEL_ID, {
        name: 'Pomodoro timers',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 220, 120, 220],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function schedulePomodoroTimerNotification(nextMode: PomodoroMode, remainingSeconds: number): Promise<string | null> {
  if (remainingSeconds <= 0) return null;
  try {
    const granted = await ensurePomodoroTimerNotifications();
    if (!granted) return null;
    const line = pick(nextMode === 'focus' ? FOCUS_DONE : BREAK_DONE);
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: line.title,
        body: line.body,
        sound: true,
        interruptionLevel: 'active',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: remainingSeconds,
        channelId: POMODORO_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

function minutesFor(mode: PomodoroMode, doc: PomodoroDoc): number {
  return mode === 'focus' ? doc.settings.focusMin : mode === 'short' ? doc.settings.shortMin : doc.settings.longMin;
}

async function saveBreakFromExpiredFocus(active: ActivePomodoroTimer, doc: PomodoroDoc, doneToday: number): Promise<ActivePomodoroTimer | null> {
  const nextMode: PomodoroMode = doneToday % doc.settings.longEvery === 0 ? 'long' : 'short';
  const nextSeconds = minutesFor(nextMode, doc) * 60;
  const endedAt = Date.parse(active.endAt);
  const elapsed = Number.isFinite(endedAt) ? Math.max(0, Math.floor((Date.now() - endedAt) / 1000)) : 0;
  const remaining = Math.max(0, nextSeconds - elapsed);
  if (remaining <= 0) {
    await clearActivePomodoroTimer();
    return null;
  }

  const startedAt = Number.isFinite(endedAt) ? new Date(endedAt).toISOString() : new Date().toISOString();
  const endAt = Number.isFinite(endedAt)
    ? new Date(endedAt + nextSeconds * 1000).toISOString()
    : new Date(Date.now() + remaining * 1000).toISOString();
  const notificationId = await schedulePomodoroTimerNotification(nextMode, remaining);
  const nextActive: ActivePomodoroTimer = {
    mode: nextMode,
    label: active.label,
    startedAt,
    endAt,
    totalSeconds: nextSeconds,
    notificationId,
  };
  await saveActivePomodoroTimer(nextActive);
  return nextActive;
}

async function completeExpiredTimerOnce(active: ActivePomodoroTimer): Promise<ActivePomodoroTimer | null> {
  if (remainingSecondsForActive(active) > 0) return active;

  if (active.notificationId) {
    void Notifications.cancelScheduledNotificationAsync(active.notificationId).catch(() => {});
  }
  await clearActivePomodoroTimer();

  if (active.mode !== 'focus') return null;

  const doc = await loadPomodoro();
  const sessionId = `focus:${active.startedAt}`;
  const alreadyLogged = doc.sessions.some(session => session.id === sessionId);
  const nextDoc: PomodoroDoc = alreadyLogged ? doc : {
    ...doc,
    sessions: [
      {
        id: sessionId,
        label: active.label.trim(),
        minutes: Math.max(1, Math.round(active.totalSeconds / 60)),
        at: active.endAt,
      },
      ...doc.sessions,
    ],
  };
  if (!alreadyLogged) await savePomodoro(nextDoc);

  const doneToday = sessionsOn(nextDoc.sessions, new Date().toISOString().slice(0, 10)).length;
  if (!nextDoc.settings.autoStartBreaks) return null;
  return saveBreakFromExpiredFocus(active, nextDoc, doneToday);
}

export async function reconcileActivePomodoroTimer(): Promise<ActivePomodoroTimer | null> {
  if (completionPromise) return completionPromise;
  completionPromise = (async () => {
    const active = await loadActivePomodoroTimer();
    if (!active) return null;
    if (remainingSecondsForActive(active) > 0) return active;
    return completeExpiredTimerOnce(active);
  })();
  try {
    return await completionPromise;
  } finally {
    completionPromise = null;
  }
}

export function PomodoroRuntimeHost(): null {
  const pathname = usePathname();
  const activeRef = useRef<ActivePomodoroTimer | null>(null);
  const skipScreenRuntime = pathname === '/mini-apps/pomodoro';

  useEffect(() => {
    if (skipScreenRuntime) return undefined;
    let cancelled = false;

    const sync = async () => {
      const active = await reconcileActivePomodoroTimer();
      if (!cancelled) activeRef.current = active;
    };

    void sync();
    const interval = setInterval(() => {
      const active = activeRef.current;
      if (!active) {
        void sync();
        return;
      }
      if (remainingSecondsForActive(active) <= 0) void sync();
    }, 1000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void sync();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [skipScreenRuntime]);

  return null;
}
