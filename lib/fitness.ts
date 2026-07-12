import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const FITNESS_KEY = 'mini:fitness';

export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Meal {
  id: string;
  name: string;
  kind: MealKind;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: string;
}

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: number;
  /** kg; 0 = bodyweight */
  weight: number;
}

export interface Workout {
  id: string;
  title: string;
  exercises: WorkoutExercise[];
  date: string;
}

export interface WeightEntry {
  id: string;
  kg: number;
  date: string;
}

export interface WaterEntry {
  id: string;
  ml: number;
  date: string;
}

/** Body measurements in cm; every field optional so partial logs are fine. */
export interface MeasurementEntry {
  id: string;
  date: string;
  chest?: number;
  waist?: number;
  hips?: number;
  arm?: number;
  thigh?: number;
}

export const MEASUREMENT_FIELDS: { key: keyof Omit<MeasurementEntry, 'id' | 'date'>; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'arm', label: 'Arm' },
  { key: 'thigh', label: 'Thigh' },
];

export interface FitnessGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** daily water goal in ml */
  waterMl: number;
  /** training sessions per week */
  workoutsPerWeek: number;
}

/** A saved workout template — the thing you actually follow along. */
export interface Routine {
  id: string;
  title: string;
  exercises: WorkoutExercise[];
  /** seconds of rest suggested between sets */
  restSec: number;
}

/** User-added food (same shape as the built-in database entries). */
export interface CustomFood {
  id: string;
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FitnessDoc {
  meals: Meal[];
  workouts: Workout[];
  weights: WeightEntry[];
  water: WaterEntry[];
  measurements: MeasurementEntry[];
  routines: Routine[];
  customFoods: CustomFood[];
  goals: FitnessGoals;
}

export const MEAL_KINDS: { kind: MealKind; label: string }[] = [
  { kind: 'breakfast', label: 'Breakfast' },
  { kind: 'lunch', label: 'Lunch' },
  { kind: 'dinner', label: 'Dinner' },
  { kind: 'snack', label: 'Snack' },
];

export const DEFAULT_GOALS: FitnessGoals = { calories: 2200, protein: 120, carbs: 250, fat: 70, waterMl: 2500, workoutsPerWeek: 4 };

const EMPTY: FitnessDoc = { meals: [], workouts: [], weights: [], water: [], measurements: [], routines: [], customFoods: [], goals: DEFAULT_GOALS };

function goalOr(v: unknown, fallback: number): number {
  return Number(v) > 0 ? Number(v) : fallback;
}

function normalizeDoc(raw: unknown): FitnessDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY };
  const doc = raw as Partial<FitnessDoc>;
  return {
    meals: Array.isArray(doc.meals) ? doc.meals : [],
    workouts: Array.isArray(doc.workouts) ? doc.workouts : [],
    weights: Array.isArray(doc.weights) ? doc.weights : [],
    water: Array.isArray(doc.water) ? doc.water : [],
    measurements: Array.isArray(doc.measurements) ? doc.measurements : [],
    routines: Array.isArray(doc.routines) ? doc.routines : [],
    customFoods: Array.isArray(doc.customFoods) ? doc.customFoods : [],
    goals: {
      calories: goalOr(doc.goals?.calories, DEFAULT_GOALS.calories),
      protein: goalOr(doc.goals?.protein, DEFAULT_GOALS.protein),
      carbs: goalOr(doc.goals?.carbs, DEFAULT_GOALS.carbs),
      fat: goalOr(doc.goals?.fat, DEFAULT_GOALS.fat),
      waterMl: goalOr(doc.goals?.waterMl, DEFAULT_GOALS.waterMl),
      workoutsPerWeek: Math.min(7, goalOr(doc.goals?.workoutsPerWeek, DEFAULT_GOALS.workoutsPerWeek)),
    },
  };
}

export async function loadFitness(): Promise<FitnessDoc> {
  const remote = await pullMiniAppIfNewer('fitness');
  if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
    await AsyncStorage.setItem(FITNESS_KEY, JSON.stringify(remote));
  }
  try {
    return normalizeDoc(JSON.parse((await AsyncStorage.getItem(FITNESS_KEY)) ?? 'null'));
  } catch {
    return { ...EMPTY };
  }
}

export async function saveFitness(doc: FitnessDoc): Promise<void> {
  await AsyncStorage.setItem(FITNESS_KEY, JSON.stringify(doc));
  pushMiniApp('fitness', doc);
}

export function isSameDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export function todayMealTotals(meals: Meal[]) {
  const today = meals.filter(m => isSameDay(m.date));
  return {
    meals: today,
    calories: today.reduce((s, m) => s + m.calories, 0),
    protein: today.reduce((s, m) => s + m.protein, 0),
    carbs: today.reduce((s, m) => s + m.carbs, 0),
    fat: today.reduce((s, m) => s + m.fat, 0),
  };
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce((s, e) => s + e.sets * e.reps * Math.max(e.weight, 0), 0);
}

export function todayWaterMl(water: WaterEntry[]): number {
  return water.filter(w => isSameDay(w.date)).reduce((s, w) => s + w.ml, 0);
}

// ── Lift progress ────────────────────────────────────────────────────────────

/** Epley estimate — comparable across rep ranges. */
export function est1RM(weight: number, reps: number): number {
  if (weight <= 0) return 0;
  return weight * (1 + reps / 30);
}

export interface LiftPoint {
  date: string;
  sets: number;
  reps: number;
  weight: number;
}

/** Per-exercise history (newest first), keyed by lowercase exercise name. */
export function liftHistory(workouts: Workout[]): Map<string, { name: string; points: LiftPoint[] }> {
  const map = new Map<string, { name: string; points: LiftPoint[] }>();
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    for (const e of w.exercises) {
      if (e.weight <= 0) continue;
      const key = e.name.trim().toLowerCase();
      if (!key) continue;
      const entry = map.get(key) ?? { name: e.name.trim(), points: [] };
      entry.points.push({ date: w.date, sets: e.sets, reps: e.reps, weight: e.weight });
      map.set(key, entry);
    }
  }
  return map;
}

// ── Period summaries ─────────────────────────────────────────────────────────

export interface PeriodSummary {
  label: string;
  workouts: number;
  volume: number;
  avgCalories: number;
  waterPct: number;
}

function summarize(doc: FitnessDoc, from: Date, to: Date, label: string): PeriodSummary {
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= from.getTime() && t < to.getTime(); };
  const workouts = doc.workouts.filter(w => inRange(w.date));
  const meals = doc.meals.filter(m => inRange(m.date));
  const water = doc.water.filter(w => inRange(w.date));
  const mealDays = new Set(meals.map(m => m.date.slice(0, 10)));
  const waterDays = new Set(water.map(w => w.date.slice(0, 10)));
  const totalWater = water.reduce((s, w) => s + w.ml, 0);
  return {
    label,
    workouts: workouts.length,
    volume: Math.round(workouts.reduce((s, w) => s + workoutVolume(w), 0)),
    avgCalories: mealDays.size ? Math.round(meals.reduce((s, m) => s + m.calories, 0) / mealDays.size) : 0,
    waterPct: waterDays.size ? Math.min(100, Math.round((totalWater / (waterDays.size * doc.goals.waterMl)) * 100)) : 0,
  };
}

/** This week + previous weeks (Monday-based), newest first. */
export function weeklySummaries(doc: FitnessDoc, weeks = 4): PeriodSummary[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const out: PeriodSummary[] = [];
  for (let i = 0; i < weeks; i++) {
    const from = new Date(monday); from.setDate(from.getDate() - 7 * i);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const label = i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`;
    out.push(summarize(doc, from, to, label));
  }
  return out;
}

/** Workouts in the current Monday-based week. */
export function thisWeekWorkoutCount(workouts: Workout[]): number {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return workouts.filter(w => new Date(w.date) >= monday).length;
}

/**
 * Consecutive weeks (including this one) where the weekly workout goal was
 * met — this week counts as alive if it still *can* be met.
 */
export function weeklyStreak(workouts: Workout[], goal: number): number {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let streak = 0;
  for (let i = 0; i < 52; i++) {
    const from = new Date(monday); from.setDate(from.getDate() - 7 * i);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const count = workouts.filter(w => {
      const t = new Date(w.date).getTime();
      return t >= from.getTime() && t < to.getTime();
    }).length;
    if (count >= goal) { streak++; continue; }
    if (i === 0) continue; // current week may still get there — don't break the streak yet
    break;
  }
  return streak;
}

/** Best previous set (by est 1RM) for an exercise, from logged history. */
export function bestLiftFor(workouts: Workout[], exerciseName: string): { weight: number; reps: number; est: number } | null {
  const key = exerciseName.trim().toLowerCase();
  let best: { weight: number; reps: number; est: number } | null = null;
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (e.name.trim().toLowerCase() !== key || e.weight <= 0) continue;
      const est = est1RM(e.weight, e.reps);
      if (!best || est > best.est) best = { weight: e.weight, reps: e.reps, est };
    }
  }
  return best;
}

/** Last logged stats for an exercise (most recent workout containing it). */
export function lastLiftFor(workouts: Workout[], exerciseName: string): WorkoutExercise | null {
  const key = exerciseName.trim().toLowerCase();
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const hit = w.exercises.find(e => e.name.trim().toLowerCase() === key);
    if (hit) return hit;
  }
  return null;
}

/** Which exercises in `next` set a new est-1RM PR over everything in `history`. */
export function detectPRs(history: Workout[], next: Workout): { name: string; weight: number; reps: number }[] {
  const prs: { name: string; weight: number; reps: number }[] = [];
  for (const e of next.exercises) {
    if (e.weight <= 0) continue;
    const prev = bestLiftFor(history, e.name);
    if (!prev || est1RM(e.weight, e.reps) > prev.est + 0.1) {
      prs.push({ name: e.name, weight: e.weight, reps: e.reps });
    }
  }
  return prs;
}

export function monthlySummaries(doc: FitnessDoc, months = 2): PeriodSummary[] {
  const now = new Date();
  const out: PeriodSummary[] = [];
  for (let i = 0; i < months; i++) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = i === 0 ? 'This month' : from.toLocaleDateString([], { month: 'long' });
    out.push(summarize(doc, from, to, label));
  }
  return out;
}
