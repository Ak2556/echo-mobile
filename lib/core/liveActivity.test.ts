import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  startActivity: vi.fn(() => 'act-1'),
  updateActivity: vi.fn(),
  stopActivity: vi.fn(),
}));
const platform = vi.hoisted(() => ({ OS: 'ios' }));
const flag = vi.hoisted(() => ({ on: true }));
const store = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('./remoteFlags', () => ({ isFeatureEnabled: () => flag.on }));
vi.mock('../../store/persist', () => ({
  persistGet: (k: string, fallback: unknown) => (store.has(k) ? JSON.parse(store.get(k)!) : fallback),
  persistSet: (k: string, v: unknown) => { store.set(k, JSON.stringify(v)); },
  persistDelete: (k: string) => { store.delete(k); },
}));

import {
  beginLiveActivity, endLiveActivity, updateLiveActivity, setNativeForTests,
  formatElapsed, pomodoroActivity, recordingActivity, publishingActivity,
} from './liveActivity';

const state = { title: 'T' };

beforeEach(() => {
  vi.useFakeTimers();
  setNativeForTests(native as never);
  store.clear();
  flag.on = true;
  native.startActivity.mockReset().mockReturnValue('act-1');
  native.updateActivity.mockReset();
  native.stopActivity.mockReset();
});

describe('beginLiveActivity', () => {
  it('starts a card and remembers its id', () => {
    beginLiveActivity('pomodoro', state);
    expect(native.startActivity).toHaveBeenCalledWith(state, undefined);
    expect(JSON.parse(store.get('liveActivity:pomodoro')!)).toBe('act-1');
  });

  it('takes over a card left by a previous launch instead of starting a second', () => {
    store.set('liveActivity:pomodoro', JSON.stringify('old'));
    beginLiveActivity('pomodoro', state);
    expect(native.updateActivity).toHaveBeenCalledWith('old', state);
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('starts fresh when the remembered card has already ended', () => {
    store.set('liveActivity:pomodoro', JSON.stringify('gone'));
    native.updateActivity.mockImplementationOnce(() => { throw new Error('no such activity'); });
    beginLiveActivity('pomodoro', state);
    expect(native.startActivity).toHaveBeenCalled();
    expect(JSON.parse(store.get('liveActivity:pomodoro')!)).toBe('act-1');
  });

  it('does nothing when the kill switch is off', () => {
    flag.on = false;
    beginLiveActivity('pomodoro', state);
    expect(native.startActivity).not.toHaveBeenCalled();
  });

  it('never throws when the native call does', () => {
    native.startActivity.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => beginLiveActivity('recording', state)).not.toThrow();
  });
});

describe('updateLiveActivity', () => {
  it('updates the remembered card, and is a no-op without one', () => {
    updateLiveActivity('recording', state);
    expect(native.updateActivity).not.toHaveBeenCalled();
    beginLiveActivity('recording', state);
    updateLiveActivity('recording', { title: 'U' });
    expect(native.updateActivity).toHaveBeenCalledWith('act-1', { title: 'U' });
  });
});

describe('endLiveActivity', () => {
  it('stops at once with no linger', () => {
    beginLiveActivity('pomodoro', state);
    endLiveActivity('pomodoro', { title: 'Done' });
    expect(native.stopActivity).toHaveBeenCalledWith('act-1', { title: 'Done' });
    expect(store.has('liveActivity:pomodoro')).toBe(false);
  });

  it('shows the closing message, then stops after the linger', () => {
    beginLiveActivity('publishing', state);
    endLiveActivity('publishing', { title: 'Posted' }, 4000);
    expect(native.updateActivity).toHaveBeenCalledWith('act-1', { title: 'Posted' });
    expect(native.stopActivity).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(native.stopActivity).toHaveBeenCalledTimes(1);
  });

  it('still ends when the kill switch is off', () => {
    beginLiveActivity('pomodoro', state);
    flag.on = false;
    endLiveActivity('pomodoro', { title: 'Done' });
    expect(native.stopActivity).toHaveBeenCalled();
  });

  it('dismisses a lingering card the moment the same kind starts again (focus ends, break begins)', () => {
    beginLiveActivity('pomodoro', state);
    endLiveActivity('pomodoro', { title: 'Focus complete' }, 8000);
    native.startActivity.mockReturnValue('act-2');
    beginLiveActivity('pomodoro', { title: 'Short break' });
    expect(native.stopActivity).toHaveBeenCalledWith('act-1', { title: 'Focus complete' });
    expect(JSON.parse(store.get('liveActivity:pomodoro')!)).toBe('act-2');
    vi.advanceTimersByTime(8000);
    expect(native.stopActivity).toHaveBeenCalledTimes(1); // the old timer does not fire again
  });
});

describe('off iOS', () => {
  it('is a no-op on Android', () => {
    setNativeForTests(undefined);
    platform.OS = 'android';
    try {
      beginLiveActivity('pomodoro', state);
      expect(native.startActivity).not.toHaveBeenCalled();
    } finally {
      platform.OS = 'ios';
    }
  });
});

describe('what the cards say', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(3725)).toBe('1:02:05');
    expect(formatElapsed(-4)).toBe('0:00');
  });

  it('pomodoro carries its end and its start, so the ring fills against the real length', () => {
    const { state: s, config } = pomodoroActivity('focus', ' Essay ', 500_000, 1_000_000);
    expect(s.title).toBe('Focus');
    expect(s.subtitle).toBe('Essay');
    expect(s.progressBar).toEqual({ date: 1_000_000, progress: 500_000 });
    expect(config.deepLinkUrl).toBe('/mini-apps/pomodoro');
    expect(pomodoroActivity('long', '', 1, 5).state.title).toBe('Long break');
  });

  it('recording carries only its start; the widget counts up by itself', () => {
    const { state: s, config } = recordingActivity(1_700_000_000_000);
    expect(s.progressBar).toEqual({ date: undefined, progress: 1_700_000_000_000 });
    expect(s.title).toBe('Recording');
    expect(config.deepLinkUrl).toBe('/mini-apps/voice-memo');
  });

  it('publishing has a state for each stage', () => {
    expect(publishingActivity('uploading', 'video').state.subtitle).toBe('Uploading video…');
    expect(publishingActivity('uploading', 'photo').state.subtitle).toBe('Uploading photos…');
    expect(publishingActivity('posted', 'photo').state.title).toBe('Posted');
    expect(publishingActivity('queued', 'photo').state.title).toBe('Saved');
    expect(publishingActivity('failed', 'video').state.title).toBe('Couldn’t post');
  });

  it('only names images that ship in assets/liveActivity', async () => {
    const { readdirSync } = await import('node:fs');
    const shipped = new Set(readdirSync('assets/liveActivity').map(f => f.replace(/\.png$/, '')));
    const all = [
      pomodoroActivity('focus', '', 1, 2).state,
      recordingActivity(1).state,
      publishingActivity('uploading', 'video').state,
      publishingActivity('posted', 'video').state,
      publishingActivity('queued', 'video').state,
      publishingActivity('failed', 'video').state,
    ];
    for (const s of all) {
      expect(shipped.has(s.imageName!)).toBe(true);
      expect(shipped.has(s.dynamicIslandImageName!)).toBe(true);
    }
  });
});
