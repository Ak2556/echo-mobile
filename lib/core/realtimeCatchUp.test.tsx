import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A controllable AppState: tests drive the transitions a phone goes through.
const listeners = new Set<(s: string) => void>();
const appState = { currentState: 'active' as string };
vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return appState.currentState; },
    addEventListener: (_: string, fn: (s: string) => void) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
  },
}));
const moveTo = (s: string) => { appState.currentState = s; listeners.forEach(fn => fn(s)); };

import { catchUpOnJoin, isResumeFromBackground, useCatchUpOnResume } from './realtimeCatchUp';

beforeEach(() => {
  listeners.clear();
  appState.currentState = 'active';
});

describe('catchUpOnJoin: nothing is replayed after a reconnect', () => {
  it('refetches on the first join and on every rejoin', () => {
    const catchUp = vi.fn();
    const onStatus = catchUpOnJoin(catchUp);
    onStatus('SUBSCRIBED');      // first join: covers the gap after the first fetch
    onStatus('CHANNEL_ERROR');   // socket dropped
    onStatus('SUBSCRIBED');      // rejoined: whatever was sent meanwhile is missing
    expect(catchUp).toHaveBeenCalledTimes(2);
  });

  it('does nothing on failure states, which have nothing new to show', () => {
    const catchUp = vi.fn();
    const onStatus = catchUpOnJoin(catchUp);
    for (const s of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) onStatus(s);
    expect(catchUp).not.toHaveBeenCalled();
  });
});

describe('isResumeFromBackground', () => {
  it.each([
    ['background', 'active', true],
    ['inactive', 'active', false],   // Face ID, a system sheet: never suspended
    ['active', 'background', false],
    ['active', 'inactive', false],
  ] as const)('%s → %s is %s', (prev, next, expected) => {
    expect(isResumeFromBackground(prev, next)).toBe(expected);
  });
});

describe('useCatchUpOnResume', () => {
  it('refetches when the phone comes back from the background', () => {
    const catchUp = vi.fn();
    renderHook(() => useCatchUpOnResume(catchUp));
    moveTo('inactive');
    moveTo('background');
    moveTo('active');
    expect(catchUp).toHaveBeenCalledTimes(1);
  });

  it('ignores an inactive blip', () => {
    const catchUp = vi.fn();
    renderHook(() => useCatchUpOnResume(catchUp));
    moveTo('inactive');
    moveTo('active');
    expect(catchUp).not.toHaveBeenCalled();
  });

  it('stays off when disabled, and stops listening on unmount', () => {
    const catchUp = vi.fn();
    renderHook(() => useCatchUpOnResume(catchUp, false));
    moveTo('background'); moveTo('active');
    const { unmount } = renderHook(() => useCatchUpOnResume(catchUp));
    unmount();
    moveTo('background'); moveTo('active');
    expect(catchUp).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});

describe('DM subscriptions are wired to catch up', () => {
  const src = readFileSync(resolve(__dirname, '../../hooks/queries/useDMs.ts'), 'utf8');

  it('every postgres_changes channel in useDMs subscribes with a catch-up', () => {
    // A bare .subscribe() on a postgres_changes channel is the bug: events
    // sent while it was down are lost for good.
    const subscribes = [...src.matchAll(/\.subscribe\(([^)]*)\)/g)].map(m => m[1]);
    const pgChannels = (src.match(/'postgres_changes'/g) ?? []).length;
    expect(pgChannels).toBeGreaterThan(0);
    const withCatchUp = subscribes.filter(a => a.startsWith('catchUpOnJoin(')).length;
    expect(withCatchUp).toBe(2); // conversation list + open thread
  });

  it('both also catch up on resume', () => {
    expect(src).toMatch(/useCatchUpOnResume\(catchUpList, remote\)/);
    expect(src).toMatch(/useCatchUpOnResume\(catchUpThread, remote && !!conversationId\)/);
  });
});
