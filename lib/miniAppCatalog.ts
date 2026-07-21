import type { Href } from 'expo-router';
import type { TargetMiniAppId } from './targetCategories';

export interface MiniAppCatalogItem {
  id: TargetMiniAppId;
  name: string;
  description: string;
  suite: 'Master' | 'Plan' | 'Focus' | 'Money' | 'Health' | 'Capture' | 'Utility';
  promise: string;
  highlights: string[];
  replaces: string[];
  color: string;
  route: Href;
}

export const MINI_APP_CATALOG: MiniAppCatalogItem[] = [
  {
    id: 'learn',
    name: 'Learn',
    description: 'Master',
    suite: 'Master',
    promise: 'Guided paths. Practice. Proof.',
    highlights: ['Paths', '1:1', 'Proof'],
    replaces: ['Courses', 'Tutor booking', 'Study planner'],
    color: '#38BDF8',
    route: '/mini-apps/learn',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    description: 'Action',
    suite: 'Plan',
    promise: 'Prioritize today. Finish together.',
    highlights: ['Today', 'Due', 'Coach'],
    replaces: ['To-do app', 'Reminder list'],
    color: '#4F7DF3',
    route: '/mini-apps/tasks',
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Plan',
    suite: 'Plan',
    promise: 'Plan around energy and time.',
    highlights: ['Blocks', 'Rhythm', 'Targets'],
    replaces: ['Daily planner', 'Routine board'],
    color: '#7C6CE8',
    route: '/mini-apps/planner',
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Remember',
    suite: 'Capture',
    promise: 'Capture thoughts. Find them fast.',
    highlights: ['Folders', 'Lists', 'Links'],
    replaces: ['Notes app', 'Checklist app'],
    color: '#F59E0B',
    route: '/mini-apps/notes',
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'Flow',
    suite: 'Focus',
    promise: 'Timed focus that keeps running.',
    highlights: ['Background', 'Color', 'History'],
    replaces: ['Focus timer', 'Session tracker'],
    color: '#EF4444',
    route: '/mini-apps/pomodoro',
  },
  {
    id: 'habits',
    name: 'Habits',
    description: 'Streak',
    suite: 'Focus',
    promise: 'Streaks, proof, recovery.',
    highlights: ['Streaks', 'Proof', 'Targets'],
    replaces: ['Habit tracker', 'Streak app'],
    color: '#10B981',
    route: '/mini-apps/habits',
  },
  {
    id: 'expenses',
    name: 'Money',
    description: 'Control',
    suite: 'Money',
    promise: 'Spend clearly. Budget calmly.',
    highlights: ['Currency', 'Budgets', 'Insight'],
    replaces: ['Budget app', 'Expense tracker'],
    color: '#8B5CF6',
    route: '/mini-apps/expenses',
  },
  {
    id: 'shopping-list',
    name: 'Shopping',
    description: 'Buy',
    suite: 'Money',
    promise: 'Essentials, grouped and budget-aware.',
    highlights: ['Groups', 'Progress', 'Budget'],
    replaces: ['Grocery list', 'Errand list'],
    color: '#12A878',
    route: '/mini-apps/shopping-list',
  },
  {
    id: 'fitness',
    name: 'Fitness',
    description: 'Fit',
    suite: 'Health',
    promise: 'Workouts, meals, visible progress.',
    highlights: ['Workouts', 'Meals', 'Metrics'],
    replaces: ['Workout log', 'Meal log'],
    color: '#14B8A6',
    route: '/mini-apps/fitness',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Solve',
    suite: 'Utility',
    promise: 'Math, splits, quick decisions.',
    highlights: ['Math', 'Splits', 'Decide'],
    replaces: ['Calculator', 'Bill splitter'],
    color: '#3B82F6',
    route: '/mini-apps/calculator',
  },
  {
    id: 'voice-memo',
    name: 'Voice Memo',
    description: 'Record',
    suite: 'Capture',
    promise: 'Record ideas before they fade.',
    highlights: ['Record', 'Rename', 'Share'],
    replaces: ['Voice recorder', 'Idea capture'],
    color: '#EF4444',
    route: '/mini-apps/voice-memo',
  },
  {
    id: 'camera',
    name: 'Camera',
    description: 'Prove',
    suite: 'Capture',
    promise: 'Capture proof, progress, listings.',
    highlights: ['Proof', 'Photos', 'Share'],
    replaces: ['Scanner lite', 'Progress camera'],
    color: '#6366F1',
    route: '/mini-apps/camera',
  },
  {
    id: 'image-editor',
    name: 'Image Editor',
    description: 'Polish',
    suite: 'Capture',
    promise: 'Crop photos, trim video, export.',
    highlights: ['Crop', 'Trim', 'Export'],
    replaces: ['Basic photo editor', 'Video trimmer'],
    color: '#EC4899',
    route: '/mini-apps/image-editor',
  },
  {
    id: 'world-clock',
    name: 'World Clock',
    description: 'Meet',
    suite: 'Utility',
    promise: 'Time, weather, meeting clarity.',
    highlights: ['Cities', 'Weather', 'Meet'],
    replaces: ['World clock', 'Meeting planner'],
    color: '#0EA5E9',
    route: '/mini-apps/world-clock',
  },
  {
    id: 'markdown',
    name: 'Write',
    description: 'Write',
    suite: 'Capture',
    promise: 'Draft, preview, publish.',
    highlights: ['Preview', 'Words', 'Publish'],
    replaces: ['Markdown editor', 'Draft app'],
    color: '#64748B',
    route: '/mini-apps/markdown',
  },
  {
    id: 'password-gen',
    name: 'Passwords',
    description: 'Secure',
    suite: 'Utility',
    promise: 'Generate, audit, copy safely.',
    highlights: ['Strong', 'Options', 'Copy'],
    replaces: ['Password generator'],
    color: '#10B981',
    route: '/mini-apps/password-gen',
  },
];

export function miniAppById(id: string): MiniAppCatalogItem | undefined {
  return MINI_APP_CATALOG.find(app => app.id === id);
}

export function miniAppByRoute(route: string): MiniAppCatalogItem | undefined {
  const normalized = route.split('?')[0].replace(/\/$/, '');
  return MINI_APP_CATALOG.find(app => String(app.route).replace(/\/$/, '') === normalized);
}
