import { describe, expect, it } from 'vitest';
import { goalsAreSet, recentWeights } from './fitnessView';

const defaults = {
  goals: { calories: 2200, protein: 120, carbs: 250, fat: 70, waterMl: 2500, workoutsPerWeek: 4 },
  settings: {
    sex: 'male', age: 28, heightCm: 170, activity: 'moderate', goalType: 'maintain', targetWeightKg: null,
    autoCalories: false,
    units: { weight: 'kg', height: 'cm', water: 'ml' },
    reminders: { meals: false, water: false, workout: false },
  },
} as const;

const doc = (over: { goals?: object; settings?: object } = {}) => ({
  goals: { ...defaults.goals, ...over.goals },
  settings: { ...defaults.settings, ...over.settings },
}) as unknown as Parameters<typeof goalsAreSet>[0];

describe('goalsAreSet', () => {
  it('is false for a fresh account, whose numbers were never chosen', () => {
    expect(goalsAreSet(doc(), defaults as never)).toBe(false);
  });

  it('is true once any goal differs from the default', () => {
    expect(goalsAreSet(doc({ goals: { calories: 2650 } }), defaults as never)).toBe(true);
    expect(goalsAreSet(doc({ goals: { protein: 150 } }), defaults as never)).toBe(true);
    expect(goalsAreSet(doc({ goals: { waterMl: 3100 } }), defaults as never)).toBe(true);
  });

  it('is true once the body details differ, so targets computed from them are real', () => {
    expect(goalsAreSet(doc({ settings: { age: 41 } }), defaults as never)).toBe(true);
    expect(goalsAreSet(doc({ settings: { heightCm: 182 } }), defaults as never)).toBe(true);
    expect(goalsAreSet(doc({ settings: { goalType: 'lose' } }), defaults as never)).toBe(true);
    expect(goalsAreSet(doc({ settings: { targetWeightKg: 80 } }), defaults as never)).toBe(true);
  });

  it('is true when targets are calculated from the profile', () => {
    expect(goalsAreSet(doc({ settings: { autoCalories: true } }), defaults as never)).toBe(true);
  });

  it('ignores units and reminders, which are preferences and not goals', () => {
    const d = doc({ settings: { units: { weight: 'lb', height: 'ft', water: 'oz' }, reminders: { meals: true, water: true, workout: true } } });
    expect(goalsAreSet(d, defaults as never)).toBe(false);
  });
});

describe('recentWeights', () => {
  const list = [5, 4, 3, 2, 1];

  it('shows the latest three and counts the rest', () => {
    expect(recentWeights(list, false)).toEqual({ rows: [5, 4, 3], hidden: 2 });
  });

  it('shows everything when asked', () => {
    expect(recentWeights(list, true)).toEqual({ rows: list, hidden: 0 });
  });

  it('hides nothing when there is no more than the limit', () => {
    expect(recentWeights([2, 1], false)).toEqual({ rows: [2, 1], hidden: 0 });
    expect(recentWeights([], false)).toEqual({ rows: [], hidden: 0 });
  });

  it('does not change the list it is given', () => {
    const input = [3, 2, 1, 0];
    recentWeights(input, false);
    expect(input).toEqual([3, 2, 1, 0]);
  });
});
