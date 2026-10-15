import { create } from 'zustand';

/**
 * Whether anything on screen is scrolling right now. The voice bubble steps back while it
 * is, so it never sits on the line someone is reading. Scroll views call `noteScroll()`
 * from their onScroll; it flips `scrolling` on and, 350 ms after the last event, off.
 */
export const SCROLL_IDLE_MS = 350;

interface ScrollActivityState { scrolling: boolean }

export const useScrollActivity = create<ScrollActivityState>(() => ({ scrolling: false }));

let timer: ReturnType<typeof setTimeout> | null = null;

export function noteScroll(): void {
  if (!useScrollActivity.getState().scrolling) useScrollActivity.setState({ scrolling: true });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    useScrollActivity.setState({ scrolling: false });
  }, SCROLL_IDLE_MS);
}
