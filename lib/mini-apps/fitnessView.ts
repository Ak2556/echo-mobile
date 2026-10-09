import type { FitnessDoc } from './fitness';

/**
 * Decisions the fitness screen makes about what to show, kept out of the 1,500-line
 * component so they can be tested.
 */

type Defaults = Pick<FitnessDoc, 'goals' | 'settings'>;

/**
 * Has this person set their own daily goals?
 *
 * Until they have, "of 2650 kcal" and the protein, carbs and fat targets are numbers
 * the app made up from a default body (28-year-old, 170 cm, "moderate"), shown as if
 * they were a goal. A fresh account saw them on the first screen, before it had
 * been told anything. Compared with the defaults rather than a stored flag, so
 * someone who already set their goals before this existed is recognised too.
 *
 * Units and reminders are preferences, not goals, and do not count.
 */
export function goalsAreSet(doc: Defaults, defaults: Defaults): boolean {
  if (doc.settings.autoCalories) return true;
  const g = doc.goals;
  const d = defaults.goals;
  if (g.calories !== d.calories || g.protein !== d.protein || g.carbs !== d.carbs
    || g.fat !== d.fat || g.waterMl !== d.waterMl || g.workoutsPerWeek !== d.workoutsPerWeek) return true;
  const s = doc.settings;
  const e = defaults.settings;
  return s.sex !== e.sex || s.age !== e.age || s.heightCm !== e.heightCm
    || s.activity !== e.activity || s.goalType !== e.goalType || s.targetWeightKg !== e.targetWeightKg;
}

/** The weigh-ins to list: the latest few, or all of them when asked. Input is newest first. */
export function recentWeights<T>(newestFirst: readonly T[], showAll: boolean, limit = 3): { rows: T[]; hidden: number } {
  if (showAll || newestFirst.length <= limit) return { rows: [...newestFirst], hidden: 0 };
  return { rows: newestFirst.slice(0, limit), hidden: newestFirst.length - limit };
}
