/**
 * Live Activities (the Dynamic Island and the lock-screen card), iOS only.
 *
 * Three things use it: a running Pomodoro, a voice memo being recorded, and a photo or
 * video post that is uploading. Everything here fails soft: on Android, on iOS older than
 * 16.2, on a build whose binary predates the native module, with Live Activities switched
 * off in Settings, or with the `liveActivities` kill switch off, every call is a no-op and
 * nothing throws. A caller never has to know which of those it is.
 *
 * The library's `stopActivity` dismisses the card immediately, so a closing message
 * ("Posted") would never be seen. `endLiveActivity` therefore updates to the final state,
 * waits `lingerMs`, then stops.
 */
import { Platform } from 'react-native';
import type { LiveActivityConfig, LiveActivityState } from 'expo-live-activity';
import { isFeatureEnabled } from './remoteFlags';
import { persistDelete, persistGet, persistSet } from '../../store/persist';

export type LiveActivityKind = 'pomodoro' | 'recording' | 'publishing';
export type { LiveActivityConfig, LiveActivityState };

type Native = typeof import('expo-live-activity');

let native: Native | null | undefined;
function loadNative(): Native | null {
  if (native !== undefined) return native;
  if (Platform.OS !== 'ios') return (native = null);
  try {
    // Lazy and guarded: on a binary built before the module existed this throws at require,
    // and an over-the-air update must not take the app down with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require('expo-live-activity') as Native;
  } catch {
    native = null;
  }
  return native;
}

/** Test seam: `require` above is not reachable by vi.mock. Pass `undefined` to reset. */
export function setNativeForTests(mod: Native | null | undefined): void {
  native = mod;
}

const idKey = (kind: LiveActivityKind) => `liveActivity:${kind}`;
// A card that is showing its closing message and will be stopped when the timer fires.
const lingering = new Map<LiveActivityKind, { timer: ReturnType<typeof setTimeout>; stop: () => void }>();

/** Stop a lingering card now, so a new one for the same kind never leaves it stranded. */
function flushLinger(kind: LiveActivityKind) {
  const pending = lingering.get(kind);
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.stop();
}

/**
 * Start the activity, or take over one this kind left running (the app was killed and
 * relaunched mid-timer): update it in place so there is never a second card.
 */
export function beginLiveActivity(kind: LiveActivityKind, state: LiveActivityState, config?: LiveActivityConfig): void {
  const mod = loadNative();
  if (!mod || !isFeatureEnabled('liveActivities')) return;
  flushLinger(kind);
  try {
    const previous = persistGet<string | null>(idKey(kind), null);
    if (previous) {
      try {
        mod.updateActivity(previous, state);
        return;
      } catch {
        persistDelete(idKey(kind)); // it ended while we were away: start a fresh one
      }
    }
    const id = mod.startActivity(state, config);
    if (id) persistSet(idKey(kind), id);
  } catch {
    /* Live Activities are never worth a crash */
  }
}

export function updateLiveActivity(kind: LiveActivityKind, state: LiveActivityState): void {
  const mod = loadNative();
  if (!mod) return;
  try {
    const id = persistGet<string | null>(idKey(kind), null);
    if (id) mod.updateActivity(id, state);
  } catch { /* ignore */ }
}

/** Show `finalState` for `lingerMs`, then dismiss. Not gated by the kill switch: a card must always be able to end. */
export function endLiveActivity(kind: LiveActivityKind, finalState: LiveActivityState, lingerMs = 0): void {
  const mod = loadNative();
  if (!mod) return;
  const id = persistGet<string | null>(idKey(kind), null);
  if (!id) return;
  flushLinger(kind);
  persistDelete(idKey(kind));
  const stop = () => {
    lingering.delete(kind);
    try { mod.stopActivity(id, finalState); } catch { /* already gone */ }
  };
  if (lingerMs <= 0) return stop();
  try { mod.updateActivity(id, finalState); } catch { return stop(); }
  lingering.set(kind, { timer: setTimeout(stop, lingerMs), stop });
}

// ── What each activity says ─────────────────────────────────────────────────────────
// The widget cannot read the app theme, so its palette is fixed here.
const ACTIVITY_BG = '#1B1A17';
const ACTIVITY_TEXT = '#FFFFFF';
const ACTIVITY_SUBTEXT = '#C9C4B8';
const ACTIVITY_TINT = '#9DB35F';
const ACTIVITY_BREAK_TINT = '#7FB3D5';

const BASE_CONFIG: LiveActivityConfig = {
  backgroundColor: ACTIVITY_BG,
  titleColor: ACTIVITY_TEXT,
  subtitleColor: ACTIVITY_SUBTEXT,
  progressViewTint: ACTIVITY_TINT,
  progressViewLabelColor: ACTIVITY_TEXT,
  timerType: 'circular',
  padding: { horizontal: 18, vertical: 14 },
  imagePosition: 'right',
  imageAlign: 'center',
  imageSize: { width: 44, height: 44 },
  contentFit: 'contain',
};

type Translate = (text: string) => string;
const identity: Translate = text => text;

export type PomodoroPhase = 'focus' | 'short' | 'long';

/**
 * The library's typed state allows a date OR a progress. Echo's widget
 * (plugins/live-activity-ui) reads both, with `progress` holding the START time in
 * milliseconds, so a ring or bar fills against the real length of the session. Both fields
 * reach the native side untouched, so this only has to get past the types.
 */
function clock(endMs: number | undefined, startMs: number): LiveActivityState['progressBar'] {
  return { date: endMs, progress: startMs } as never;
}

export function pomodoroActivity(
  phase: PomodoroPhase,
  label: string,
  startAtMs: number,
  endAtMs: number,
  t: Translate = identity,
): { state: LiveActivityState; config: LiveActivityConfig } {
  const focus = phase === 'focus';
  const title = focus ? t('Focus') : phase === 'short' ? t('Short break') : t('Long break');
  const glyph = focus ? 'live_timer' : 'live_break';
  return {
    state: {
      title,
      subtitle: label.trim() || (focus ? t('Stay with it') : t('Step away')),
      progressBar: clock(endAtMs, startAtMs),
      imageName: glyph,
      dynamicIslandImageName: glyph,
    },
    // A break reads differently at a glance: cooler tint on the bar and ring, and a cup for the glyph.
    config: { ...BASE_CONFIG, progressViewTint: focus ? ACTIVITY_TINT : ACTIVITY_BREAK_TINT, deepLinkUrl: '/mini-apps/pomodoro' },
  };
}

export function pomodoroDoneState(phase: PomodoroPhase, t: Translate = identity): LiveActivityState {
  return {
    title: phase === 'focus' ? t('Focus complete') : t('Break over'),
    subtitle: phase === 'focus' ? t('Nice work') : t('Ready when you are'),
    imageName: 'live_done',
    dynamicIslandImageName: 'live_done',
  };
}

/** Elapsed time as m:ss, or h:mm:ss past an hour. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** The widget counts the elapsed time up by itself from the start time, so nothing updates each second. */
export function recordingActivity(
  startedAtMs: number,
  t: Translate = identity,
): { state: LiveActivityState; config: LiveActivityConfig } {
  return {
    state: {
      title: t('Recording'),
      subtitle: t('Voice memo'),
      progressBar: clock(undefined, startedAtMs),
      imageName: 'live_mic',
      dynamicIslandImageName: 'live_mic',
    },
    config: { ...BASE_CONFIG, deepLinkUrl: '/mini-apps/voice-memo' },
  };
}

export function recordingSavedState(elapsedSeconds: number, t: Translate = identity): LiveActivityState {
  return {
    title: t('Memo saved'),
    subtitle: formatElapsed(elapsedSeconds),
    imageName: 'live_done',
    dynamicIslandImageName: 'live_done',
  };
}

export type PublishStage = 'uploading' | 'posted' | 'queued' | 'failed';

/** Photo and video posts only: a text post is published before there is anything to show. */
export function publishingActivity(
  stage: PublishStage,
  media: 'photo' | 'video',
  t: Translate = identity,
): { state: LiveActivityState; config: LiveActivityConfig } {
  const state: LiveActivityState =
    stage === 'uploading'
      ? {
          title: t('Posting your echo'),
          subtitle: media === 'video' ? t('Uploading video…') : t('Uploading photos…'),
          imageName: 'live_post',
          dynamicIslandImageName: 'live_post',
        }
      : stage === 'posted'
        ? { title: t('Posted'), subtitle: t('Your echo is live'), imageName: 'live_done', dynamicIslandImageName: 'live_done' }
        : stage === 'queued'
          ? { title: t('Saved'), subtitle: t('Posts when you are back online'), imageName: 'live_done', dynamicIslandImageName: 'live_done' }
          : { title: t('Couldn’t post'), subtitle: t('Open Echo to try again'), imageName: 'live_post', dynamicIslandImageName: 'live_post' };
  return { state, config: { ...BASE_CONFIG, deepLinkUrl: '/(tabs)/home' } };
}
