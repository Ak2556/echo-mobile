/**
 * H1 (2026-09-30 audit): after Android recreated the activity in a live
 * process, AuthListenerProvider navigated before the new navigator existed and
 * expo-router threw "Attempted to navigate before mounting the Root Layout".
 * The old guard read a key from a store that outlives the tree. These tests
 * drive react-navigation's real container ref through that lifecycle.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createNavigationContainerRef } from '@react-navigation/core';
import { useNavigationReady } from './useNavigationReady';

/** A navigation container as the ref sees it: listeners, isReady, emit. */
function fakeContainer(initiallyReady = false) {
  let ready = initiallyReady;
  const listeners: Record<string, Set<() => void>> = {};
  return {
    isReady: () => ready,
    addListener(event: string, cb: () => void) {
      (listeners[event] ??= new Set()).add(cb);
      return () => listeners[event]?.delete(cb);
    },
    removeListener(event: string, cb: () => void) {
      listeners[event]?.delete(cb);
    },
    emit(event: string) {
      listeners[event]?.forEach(cb => cb());
    },
    becomeReady() {
      ready = true;
      this.emit('ready');
    },
  };
}

type Ref = ReturnType<typeof createNavigationContainerRef>;
const attach = (ref: Ref, container: ReturnType<typeof fakeContainer> | null) => {
  (ref as unknown as { current: unknown }).current = container;
};

describe('useNavigationReady', () => {
  it('is false with no container, and flips when one mounts and is ready', () => {
    const ref = createNavigationContainerRef();
    const { result } = renderHook(() => useNavigationReady(ref));
    expect(result.current).toBe(false);

    const container = fakeContainer();
    act(() => attach(ref, container));   // mounted, not ready yet
    expect(result.current).toBe(false);

    act(() => container.becomeReady());  // the ref re-attached the buffered listener
    expect(result.current).toBe(true);
  });

  it('the recreate case: a new provider mounts while the old container is gone', () => {
    const ref = createNavigationContainerRef();
    const old = fakeContainer(true);
    attach(ref, old);
    const first = renderHook(() => useNavigationReady(ref));
    expect(first.result.current).toBe(true);

    // Android tears the activity down: the tree unmounts and the container
    // detaches from the ref. A new tree mounts before the new container.
    first.unmount();
    attach(ref, null);
    const second = renderHook(() => useNavigationReady(ref));
    expect(second.result.current).toBe(false); // the old key-based guard said "go" here

    const fresh = fakeContainer();
    act(() => attach(ref, fresh));
    expect(second.result.current).toBe(false);
    act(() => fresh.becomeReady());
    expect(second.result.current).toBe(true);
  });

  it('is true straight away when the container is already ready', () => {
    const ref = createNavigationContainerRef();
    attach(ref, fakeContainer(true));
    const { result } = renderHook(() => useNavigationReady(ref));
    expect(result.current).toBe(true);
  });

  it('catches up on the next state event if "ready" fired before it subscribed', () => {
    const ref = createNavigationContainerRef();
    const container = fakeContainer();
    attach(ref, container);
    const { result } = renderHook(() => useNavigationReady(ref));
    // Ready flips without a 'ready' event reaching this hook.
    act(() => { (container as unknown as { isReady: () => boolean }).isReady = () => true; container.emit('state'); });
    expect(result.current).toBe(true);
  });
});
