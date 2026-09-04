/**
 * THROWAWAY — dev-only instrumentation for the video smoothness investigation.
 *
 * Answers one question the code cannot answer by inspection: how many native
 * video players are actually alive while scrolling the flow on a real device.
 *
 * The hypothesis it tests is that VideoPreview creates a player per MOUNTED
 * card rather than per ACTIVE card, so a low-RAM device runs several hardware
 * decoders at once. If the live count reads 1 during a scroll, that hypothesis
 * is wrong and the cost is decode/bandwidth rather than concurrency — which
 * points at a transcode ladder instead of a player-lifecycle fix.
 *
 * Delete this file and its three call sites when the question is answered.
 * Everything here is __DEV__-gated and compiles to nothing meaningful in a
 * production bundle.
 */

import { useEffect, useState } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();

const state = {
  /** Players constructed and not yet torn down. */
  live: 0,
  /** High-water mark for the session — the number that actually matters. */
  peak: 0,
  /** Total constructed, to show churn: a high total with a low peak means
   *  players are being created and destroyed rapidly, which is its own cost. */
  created: 0,
};

function emit(): void {
  listeners.forEach((l) => {
    try { l(); } catch { /* a broken listener must not break playback */ }
  });
}

/** Call when a native player is constructed. */
export function probePlayerCreated(): void {
  if (!__DEV__) return;
  state.live += 1;
  state.created += 1;
  if (state.live > state.peak) state.peak = state.live;
  emit();
}

/** Call when a player is torn down. */
export function probePlayerReleased(): void {
  if (!__DEV__) return;
  state.live = Math.max(0, state.live - 1);
  emit();
}

export function probeSnapshot(): { live: number; peak: number; created: number } {
  return { ...state };
}

export function probeReset(): void {
  state.live = 0;
  state.peak = 0;
  state.created = 0;
  emit();
}

/** Subscribe a component to counter changes. */
export function useVideoProbe(): { live: number; peak: number; created: number } {
  const [snap, setSnap] = useState(probeSnapshot);
  useEffect(() => {
    const l = () => setSnap(probeSnapshot());
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return snap;
}
