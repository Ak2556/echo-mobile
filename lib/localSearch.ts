import type { Href } from 'expo-router';
import { loadTransactions, summarizeExpenses, formatMoney } from './expenses';
import { getStreak, loadHabits, todayStr } from './habits';
import { loadNotes } from './notes';
import { loadMemos, formatMemoTime } from './voiceMemos';
import { loadTasks } from './tasks';
import { loadPlanner } from './planner';
import { loadShoppingList } from './shoppingList';
import { learningStats, loadLearningGoals } from './learn';
import { loadFitness, thisWeekWorkoutCount, todayMealTotals, todayWaterMl, weeklyStreak } from './fitness';
import { loadWorldClockCities } from './worldClock';

export type LocalProductivityApp =
  | 'notes'
  | 'habits'
  | 'expenses'
  | 'voice-memo'
  | 'tasks'
  | 'planner'
  | 'shopping-list'
  | 'learn'
  | 'fitness'
  | 'world-clock';

export interface LocalSearchResult {
  app: LocalProductivityApp;
  id: string;
  title: string;
  subtitle: string;
  route: Href;
}

export interface TodayProductivity {
  tasks: {
    open: number;
    dueToday: number;
    high: number;
  };
  planner: {
    total: number;
    open: number;
    done: number;
  };
  shopping: {
    remaining: number;
    checked: number;
  };
  learn: {
    goals: number;
    open: number;
    active?: string;
  };
  habits: {
    total: number;
    done: number;
    percent: number;
    remaining: string[];
  };
  notes: {
    total: number;
    recent: Array<{ id: string; title: string }>;
  };
  expenses: {
    income: number;
    expense: number;
    balance: number;
    biggestCategory?: { category: string; amount: number };
  };
  voiceMemos: {
    total: number;
    recent: Array<{ id: string; title: string; duration: number }>;
  };
  fitness: {
    calories: number;
    waterMl: number;
    workoutsThisWeek: number;
    streak: number;
  };
  worldClock: {
    cities: number;
    primary?: string;
  };
}

export async function searchLocalProductivity(query: string, limit = 12): Promise<LocalSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const [notes, habits, txs, memos, tasks, planner, shopping, learningGoals, fitness, worldClockCities] = await Promise.all([
    loadNotes(),
    loadHabits(),
    loadTransactions(),
    loadMemos(),
    loadTasks(),
    loadPlanner(),
    loadShoppingList(),
    loadLearningGoals(),
    loadFitness(),
    loadWorldClockCities(),
  ]);

  const results: LocalSearchResult[] = [];
  for (const note of notes) {
    if (matches(q, note.title, note.body)) {
      results.push({
        app: 'notes',
        id: note.id,
        title: note.title,
        subtitle: note.body || 'Note',
        route: '/mini-apps/notes',
      });
    }
  }
  for (const habit of habits) {
    if (matches(q, habit.name)) {
      results.push({
        app: 'habits',
        id: habit.id,
        title: habit.name,
        subtitle: `${getStreak(habit.completedDates)} day streak`,
        route: '/mini-apps/habits',
      });
    }
  }
  for (const tx of txs) {
    if (matches(q, tx.category, tx.note, tx.type)) {
      results.push({
        app: 'expenses',
        id: tx.id,
        title: `${tx.type === 'income' ? '+' : '-'}$${formatMoney(tx.amount)} ${tx.category}`,
        subtitle: tx.note || new Date(tx.date).toLocaleDateString(),
        route: '/mini-apps/expenses',
      });
    }
  }
  for (const memo of memos) {
    if (matches(q, memo.title)) {
      results.push({
        app: 'voice-memo',
        id: memo.id,
        title: memo.title,
        subtitle: `${formatMemoTime(memo.duration)} recording`,
        route: '/mini-apps/voice-memo',
      });
    }
  }
  for (const task of tasks) {
    if (matches(q, task.title, task.notes, task.priority)) {
      results.push({
        app: 'tasks',
        id: task.id,
        title: task.title,
        subtitle: `${task.done ? 'Done' : 'Open'}${task.due ? ` · due ${task.due}` : ''}`,
        route: '/mini-apps/tasks',
      });
    }
  }
  for (const item of planner) {
    if (matches(q, item.title, item.slot, item.date)) {
      results.push({
        app: 'planner',
        id: item.id,
        title: item.title,
        subtitle: `${item.slot} · ${item.date}`,
        route: '/mini-apps/planner',
      });
    }
  }
  for (const item of shopping) {
    if (matches(q, item.name, item.quantity, item.category)) {
      results.push({
        app: 'shopping-list',
        id: item.id,
        title: item.name,
        subtitle: `${item.quantity} · ${item.category}`,
        route: '/mini-apps/shopping-list',
      });
    }
  }
  for (const goal of learningGoals) {
    if (matches(
      q,
      goal.title,
      goal.category,
      goal.targetOutcome,
      ...goal.modules.map(module => module.title),
      ...goal.syllabus.map(week => `${week.title} ${week.objective} ${week.deliverable}`),
      ...goal.learners.map(learner => `${learner.name} ${learner.target} ${learner.notes ?? ''}`),
      ...goal.rubric.map(item => `${item.title} ${item.description}`),
      ...goal.evidence.map(item => `${item.title} ${item.detail}`),
      ...goal.codeLabs.map(item => `${item.title} ${item.language} ${item.prompt} ${item.starterCode} ${item.notes ?? ''}`),
      ...goal.resources.map(item => `${item.title} ${item.detail ?? ''}`),
      goal.oneOnOneProfile.headline,
      goal.oneOnOneProfile.bio,
      goal.oneOnOneProfile.teachingStyle,
      goal.oneOnOneProfile.policies,
      ...goal.oneOnOneProfile.expertise,
      ...goal.oneOnOnePackages.map(item => `${item.title} ${item.description} ${item.price} ${item.currency}`),
      ...goal.oneOnOneSlots.map(item => `${item.label} ${item.durationMinutes}`),
      ...goal.oneOnOneBookings.map(item => `${item.learnerName} ${item.learnerGoal} ${item.packageTitle} ${item.status} ${item.paymentStatus} ${item.prepNote ?? ''} ${item.homework ?? ''} ${item.followUp ?? ''}`),
    )) {
      const stats = learningStats(goal);
      results.push({
        app: 'learn',
        id: goal.id,
        title: goal.title,
        subtitle: `${stats.percent}% roadmap · ${stats.learners} learners · ${stats.oneOnOneBookings} 1:1 bookings`,
        route: '/mini-apps/learn',
      });
    }
  }
  for (const meal of fitness.meals) {
    if (matches(q, meal.name, meal.kind)) {
      results.push({
        app: 'fitness',
        id: meal.id,
        title: meal.name,
        subtitle: `${meal.calories} cal · ${meal.kind}`,
        route: '/mini-apps/fitness',
      });
    }
  }
  for (const workout of fitness.workouts) {
    if (matches(q, workout.title, ...workout.exercises.map(exercise => exercise.name))) {
      results.push({
        app: 'fitness',
        id: workout.id,
        title: workout.title,
        subtitle: `${workout.exercises.length} exercises · workout`,
        route: '/mini-apps/fitness',
      });
    }
  }
  for (const routine of fitness.routines) {
    if (matches(q, routine.title, ...routine.exercises.map(exercise => exercise.name))) {
      results.push({
        app: 'fitness',
        id: routine.id,
        title: routine.title,
        subtitle: `${routine.exercises.length} exercises · routine`,
        route: '/mini-apps/fitness',
      });
    }
  }
  for (const food of fitness.customFoods) {
    if (matches(q, food.name, food.serving)) {
      results.push({
        app: 'fitness',
        id: food.id,
        title: food.name,
        subtitle: `${food.calories} cal · custom food`,
        route: '/mini-apps/fitness',
      });
    }
  }
  for (const city of worldClockCities) {
    if (matches(q, city.name, city.region, city.timezone, city.countryCode)) {
      results.push({
        app: 'world-clock',
        id: city.id,
        title: `${city.flag} ${city.name}`,
        subtitle: `${formatCityTime(city.timezone)} · ${city.region}`,
        route: '/mini-apps/world-clock',
      });
    }
  }

  return results.slice(0, limit);
}

export async function getTodayProductivity(): Promise<TodayProductivity> {
  const [notes, habits, expenseSummary, memos, tasks, planner, shopping, learningGoals, fitness, worldClockCities] = await Promise.all([
    loadNotes(),
    loadHabits(),
    summarizeExpenses({ range: 'week' }),
    loadMemos(),
    loadTasks(),
    loadPlanner(),
    loadShoppingList(),
    loadLearningGoals(),
    loadFitness(),
    loadWorldClockCities(),
  ]);
  const today = todayStr();
  const done = habits.filter(habit => habit.completedDates.includes(today));
  const openTasks = tasks.filter(task => !task.done);
  const todayPlans = planner.filter(item => item.date === today);
  const shoppingOpen = shopping.filter(item => !item.checked);
  const mealTotals = todayMealTotals(fitness.meals);
  return {
    tasks: {
      open: openTasks.length,
      dueToday: openTasks.filter(task => task.due === today).length,
      high: openTasks.filter(task => task.priority === 'high').length,
    },
    planner: {
      total: todayPlans.length,
      open: todayPlans.filter(item => !item.done).length,
      done: todayPlans.filter(item => item.done).length,
    },
    shopping: {
      remaining: shoppingOpen.length,
      checked: shopping.length - shoppingOpen.length,
    },
    learn: {
      goals: learningGoals.length,
      open: learningGoals.reduce((sum, goal) => sum + learningStats(goal).open, 0),
      active: learningGoals[0]?.title,
    },
    habits: {
      total: habits.length,
      done: done.length,
      percent: habits.length ? Math.round((done.length / habits.length) * 100) : 0,
      remaining: habits.filter(habit => !habit.completedDates.includes(today)).map(habit => habit.name),
    },
    notes: {
      total: notes.length,
      recent: notes.slice(0, 3).map(note => ({ id: note.id, title: note.title })),
    },
    expenses: {
      income: expenseSummary.income,
      expense: expenseSummary.expense,
      balance: expenseSummary.balance,
      biggestCategory: expenseSummary.byCategory.find(item => item.type === 'expense'),
    },
    voiceMemos: {
      total: memos.length,
      recent: memos.slice(0, 3).map(memo => ({ id: memo.id, title: memo.title, duration: memo.duration })),
    },
    fitness: {
      calories: mealTotals.calories,
      waterMl: todayWaterMl(fitness.water),
      workoutsThisWeek: thisWeekWorkoutCount(fitness.workouts),
      streak: weeklyStreak(fitness.workouts, fitness.goals.workoutsPerWeek),
    },
    worldClock: {
      cities: worldClockCities.length,
      primary: worldClockCities[0]?.name,
    },
  };
}

function matches(query: string, ...values: Array<string | undefined>): boolean {
  return values.some(value => value?.toLowerCase().includes(query));
}

function formatCityTime(timezone: string): string {
  try {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: timezone || 'UTC' });
  } catch {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
}
