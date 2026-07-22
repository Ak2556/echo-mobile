import type { DailyQuestion } from './supabaseEchoApi';

/**
 * Fallback daily question for the first-run value moment.
 *
 * The real daily question comes from the `daily_questions` table (one row per
 * UTC day). If today's row is somehow missing, the /welcome aha would dead-end
 * on "No question today" — the worst possible first impression. So we always
 * have a warm, low-stakes local prompt to fall back to.
 *
 * A local question has a sentinel id and is NOT persisted to `daily_answers`
 * (its id has no FK row). Callers should render it with `persist={false}`.
 */
export const FIRST_RUN_QUESTION_ID = 'first-run-local';

export function getFirstRunFallbackQuestion(): DailyQuestion {
  return {
    id: FIRST_RUN_QUESTION_ID,
    active_date: new Date().toISOString().slice(0, 10),
    question: 'What is one thing you want to think through, learn, or make progress on right now?',
  };
}

export function isLocalFirstRunQuestion(id: string): boolean {
  return id === FIRST_RUN_QUESTION_ID;
}
