import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCROLL_IDLE_MS, noteScroll, useScrollActivity } from './scrollActivity';

describe('scrollActivity', () => {
  beforeEach(() => { vi.useFakeTimers(); useScrollActivity.setState({ scrolling: false }); });
  afterEach(() => { vi.useRealTimers(); });

  it('is idle until something scrolls', () => {
    expect(useScrollActivity.getState().scrolling).toBe(false);
  });

  it('is scrolling right after an event', () => {
    noteScroll();
    expect(useScrollActivity.getState().scrolling).toBe(true);
  });

  it('goes idle once events stop', () => {
    noteScroll();
    vi.advanceTimersByTime(SCROLL_IDLE_MS + 1);
    expect(useScrollActivity.getState().scrolling).toBe(false);
  });

  it('stays scrolling while events keep arriving', () => {
    noteScroll();
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 50);
    noteScroll();
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 50);
    expect(useScrollActivity.getState().scrolling).toBe(true);
    vi.advanceTimersByTime(100);
    expect(useScrollActivity.getState().scrolling).toBe(false);
  });
});
