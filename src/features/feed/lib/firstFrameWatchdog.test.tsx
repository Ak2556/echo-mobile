import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { FIRST_FRAME_GRACE_MS, useFirstFrameWatchdog } from './firstFrameWatchdog';

/**
 * A player that says it is ready and then draws nothing.
 *
 * VideoPreview trusted `readyToPlay` as proof there was a picture. Its 45s
 * watchdog is guarded by `loadState === 'loading'`, so reaching 'ready'
 * cancelled it for good — and its WebView fallback only runs on 'error'. A
 * decoder that reports success and produces no frames therefore left the
 * spinner hidden, the fallback dormant, and a black rectangle on screen with no
 * way out of it.
 *
 * Found on an Android emulator playing a 1920x1080 HEVC Main clip: Echo's own
 * process held c2.goldfish.hevc.decoder, the status went to readyToPlay, and
 * nothing was ever drawn. The frame one second in averages RGB(172,182,193), so
 * the video is a bright sky — the black was the renderer, not the content.
 *
 * HEVC is the trigger, not the rule: five of eleven stored videos are H.265
 * because expo-image-picker's videoExportPreset is iOS-only, so Android uploads
 * the camera's original. But the hole is "ready without a frame", whatever
 * causes it, so that is what this guards.
 */
describe('useFirstFrameWatchdog', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const setup = (ready: boolean, sawFrame: boolean) =>
    renderHook(({ r, f }) => useFirstFrameWatchdog(r, f), { initialProps: { r: ready, f: sawFrame } });

  it('does not report a stall before the grace period', () => {
    const { result } = setup(true, false);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS - 1); });
    expect(result.current).toBe(false);
  });

  it('reports a stall when ready arrives and no frame follows', () => {
    const { result } = setup(true, false);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS); });
    expect(result.current).toBe(true);
  });

  it('stays quiet when a frame did arrive', () => {
    const { result } = setup(true, true);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS * 3); });
    expect(result.current).toBe(false);
  });

  it('does not run while the player is still loading', () => {
    // 'loading' already has its own longer watchdog; arming this one there too
    // would cut that short and send a slow-but-fine video to the fallback.
    const { result } = setup(false, false);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS * 3); });
    expect(result.current).toBe(false);
  });

  it('cancels once a frame arrives late but within the window', () => {
    const { result, rerender } = setup(true, false);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS - 100); });
    rerender({ r: true, f: true });
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS * 2); });
    expect(result.current, 'a frame that lands just in time must not be reported as a stall').toBe(false);
  });

  it('re-arms for the next video when ready goes false and true again', () => {
    // Cards are recycled; a stall on one URI must not latch for the next.
    const { result, rerender } = setup(true, false);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS); });
    expect(result.current).toBe(true);

    rerender({ r: false, f: false });
    expect(result.current, 'leaving ready must clear the stall').toBe(false);

    rerender({ r: true, f: false });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(FIRST_FRAME_GRACE_MS); });
    expect(result.current).toBe(true);
  });

  it('waits long enough not to punish a slow connection', () => {
    // Short enough that nobody stares at black, long enough that a 4G first
    // frame is not mistaken for a dead decoder.
    expect(FIRST_FRAME_GRACE_MS).toBeGreaterThanOrEqual(5000);
    expect(FIRST_FRAME_GRACE_MS).toBeLessThanOrEqual(12000);
  });
});
