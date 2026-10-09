/**
 * What the pomodoro screen shows when, kept out of the 1,300-line component so the
 * rules can be tested.
 *
 * The screen stacked eleven panels around one timer, and the Start button sat below
 * the bottom of the screen: the day's count and the streak each appeared five or six
 * times. Everything is still there. These rules decide what is out of the way until
 * it means something.
 */

export type PomodoroMode = 'focus' | 'short' | 'long';

/**
 * The four stages (Settle, Build, Push, Ship) mark how far a session has got. Before
 * a session starts they only say "Settle", which is noise; they mean something once
 * time is passing.
 */
export function showStageRail(running: boolean, elapsedPct: number): boolean {
  return running || elapsedPct > 0;
}

/**
 * The 15, 25 and 50 minute shortcuts change the length of a focus block, so they
 * belong to the Focus tab, and they cannot be changed under a running timer.
 */
export function showFocusPresets(mode: PomodoroMode, running: boolean): boolean {
  return mode === 'focus' && !running;
}

/** One line for the closed Progress section, so closing it hides nothing it said. */
export function progressSummary(count: number, goal: number, streakDays: number): string {
  const today = `${count}/${goal}`;
  return streakDays > 0 ? `${today} · ${streakDays}d streak` : today;
}
