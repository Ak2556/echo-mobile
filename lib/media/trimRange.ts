/** Shortest clip the trimmer will produce. */
export const MIN_TRIM_MS = 1000;

export interface TrimRange {
  startMs: number;
  endMs: number;
}

function minLength(durationMs: number): number {
  return Math.min(MIN_TRIM_MS, durationMs);
}

/** Drag the start handle: it stops short of the end by the minimum clip length. */
export function moveStart(nextMs: number, range: TrimRange, durationMs: number): TrimRange {
  const startMs = Math.max(0, Math.min(nextMs, range.endMs - minLength(durationMs)));
  return { startMs, endMs: range.endMs };
}

/** Drag the end handle: it stops short of the start by the minimum clip length and of the clip's end. */
export function moveEnd(nextMs: number, range: TrimRange, durationMs: number): TrimRange {
  const endMs = Math.min(durationMs, Math.max(nextMs, range.startMs + minLength(durationMs)));
  return { startMs: range.startMs, endMs };
}

/** m:ss.t — the tenth matters when the clip is a few seconds long. */
export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.round(ms / 100) * 100);
  const totalSeconds = Math.floor(safe / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}.${tenths}`;
}

/** Whether the range is the whole clip, so trimming would change nothing. */
export function isWholeClip(range: TrimRange, durationMs: number): boolean {
  return range.startMs <= 0 && range.endMs >= durationMs;
}
