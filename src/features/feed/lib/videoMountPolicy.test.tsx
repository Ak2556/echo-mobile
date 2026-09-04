import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const tier = vi.hoisted(() => ({ value: 'mid' as 'high' | 'mid' | 'low' }));
vi.mock('../../../../lib/deviceTier', () => ({
  getDeviceTier: () => tier.value,
}));

import { useVideoMountPolicy } from './videoMountPolicy';

/**
 * The behaviour under test is a trade, so both directions matter:
 * releasing too eagerly turns a fast scroll into player churn, and releasing
 * too late leaves the concurrent decoders this exists to prevent.
 */
describe('useVideoMountPolicy', () => {
  beforeEach(() => { vi.useFakeTimers(); tier.value = 'mid'; });
  afterEach(() => { vi.useRealTimers(); });

  it('mounts immediately when the card becomes active', () => {
    const { result, rerender } = renderHook(({ a }) => useVideoMountPolicy(a), {
      initialProps: { a: false },
    });
    expect(result.current).toBe(false);
    rerender({ a: true });
    // No timer advance: becoming active must never be delayed.
    expect(result.current).toBe(true);
  });

  it('holds the player through the grace window after going inactive', () => {
    const { result, rerender } = renderHook(({ a }) => useVideoMountPolicy(a), {
      initialProps: { a: true },
    });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current, 'still mounted inside the grace window').toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current, 'released after the grace window').toBe(false);
  });

  it('does not release when a card is scrolled back to within the window', () => {
    const { result, rerender } = renderHook(({ a }) => useVideoMountPolicy(a), {
      initialProps: { a: true },
    });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(300); });
    rerender({ a: true });                       // scrolled back
    act(() => { vi.advanceTimersByTime(5000); }); // the old timer must not fire
    expect(result.current).toBe(true);
  });

  it('releases sooner on a low-tier device than a high-tier one', () => {
    tier.value = 'low';
    const low = renderHook(({ a }) => useVideoMountPolicy(a), { initialProps: { a: true } });
    low.rerender({ a: false });
    act(() => { vi.advanceTimersByTime(300); });
    expect(low.result.current, 'low tier released by 300ms').toBe(false);

    tier.value = 'high';
    const high = renderHook(({ a }) => useVideoMountPolicy(a), { initialProps: { a: true } });
    high.rerender({ a: false });
    act(() => { vi.advanceTimersByTime(300); });
    expect(high.result.current, 'high tier still warm at 300ms').toBe(true);
  });

  it('still releases on low tier, rather than never mounting a player', () => {
    // A zero grace period would mean a fast flick builds and tears down a
    // player per card passed; the guard must be short, not absent.
    tier.value = 'low';
    const { result, rerender } = renderHook(({ a }) => useVideoMountPolicy(a), {
      initialProps: { a: true },
    });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current, 'not released instantly — churn guard').toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(false);
  });
});
