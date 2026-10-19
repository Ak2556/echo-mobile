import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hook's only collaborators: focus, app state, the gateway call and the store. All controllable here.
const focusListeners = new Set<() => void>();
let focused = true;
const appStateListeners = new Set<(s: string) => void>();
const appState = { currentState: 'active' as string };
const fetchNewEchoCount = vi.fn();

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      const [f, setF] = React.useState(focused);
      React.useEffect(() => {
        const l = () => setF(focused);
        focusListeners.add(l);
        return () => { focusListeners.delete(l); };
      }, []);
      React.useEffect(() => (f ? cb() : undefined), [f, cb]);
    },
  };
});
vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return appState.currentState; },
    addEventListener: (_e: string, fn: (s: string) => void) => {
      appStateListeners.add(fn);
      return { remove: () => { appStateListeners.delete(fn); } };
    },
  },
}));
vi.mock('../lib/supabaseEchoApi', () => ({ fetchNewEchoCount: (...a: unknown[]) => fetchNewEchoCount(...a) }));
vi.mock('../store/useAppStore', () => ({ useAppStore: (sel: (s: { userId: string }) => unknown) => sel({ userId: 'user-1' }) }));

import { useNewEchoes } from './useNewEchoes';

const setFocus = (v: boolean) => { focused = v; act(() => { focusListeners.forEach((l) => l()); }); };
const setApp = (s: string) => { appState.currentState = s; act(() => { appStateListeners.forEach((l) => l(s)); }); };
const minutes = async (n: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(n * 60_000); }); };

describe('useNewEchoes (the "N new echoes" pill)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    focused = true; appState.currentState = 'active';
    fetchNewEchoCount.mockReset().mockResolvedValue(3);
  });
  afterEach(() => { vi.useRealTimers(); delete process.env.EXPO_PUBLIC_SUPABASE_URL; });

  it('does nothing at first, then reports the count after a minute, excluding my own posts', async () => {
    const { result } = renderHook(() => useNewEchoes());
    expect(fetchNewEchoCount).not.toHaveBeenCalled();
    expect(result.current.count).toBe(0);
    await minutes(1);
    expect(fetchNewEchoCount).toHaveBeenCalledTimes(1);
    expect(fetchNewEchoCount).toHaveBeenCalledWith('2026-10-19T12:00:00.000Z', 'user-1');
    expect(result.current.count).toBe(3);
  });

  it('stops polling when Home loses focus and checks at once when it regains it', async () => {
    renderHook(() => useNewEchoes());
    await minutes(1);
    expect(fetchNewEchoCount).toHaveBeenCalledTimes(1);
    setFocus(false);
    await minutes(5);
    expect(fetchNewEchoCount).toHaveBeenCalledTimes(1); // nothing while hidden
    setFocus(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchNewEchoCount).toHaveBeenCalledTimes(2); // an immediate catch-up
  });

  it('stops in the background and checks at once when the app returns', async () => {
    renderHook(() => useNewEchoes());
    setApp('background');
    await minutes(5);
    expect(fetchNewEchoCount).not.toHaveBeenCalled();
    setApp('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchNewEchoCount).toHaveBeenCalledTimes(1);
  });

  it('reset() clears the pill and the next poll counts from the reset time', async () => {
    const { result } = renderHook(() => useNewEchoes());
    await minutes(1);
    expect(result.current.count).toBe(3);
    act(() => result.current.reset());
    expect(result.current.count).toBe(0);
    await minutes(1);
    expect(fetchNewEchoCount).toHaveBeenLastCalledWith('2026-10-19T12:01:00.000Z', 'user-1');
  });

  it('does nothing at all without a Supabase URL', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    renderHook(() => useNewEchoes());
    await minutes(3);
    expect(fetchNewEchoCount).not.toHaveBeenCalled();
  });

  it('stops everything on unmount', async () => {
    const { unmount } = renderHook(() => useNewEchoes());
    unmount();
    await minutes(3);
    expect(fetchNewEchoCount).not.toHaveBeenCalled();
    expect(appStateListeners.size).toBe(0);
  });
});
