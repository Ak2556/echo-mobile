import type { Href } from 'expo-router';
import type { TargetMiniAppId } from './targetCategories';

export interface MiniAppCatalogItem {
  id: TargetMiniAppId;
  name: string;
  description: string;
  color: string;
  route: Href;
}

export const MINI_APP_CATALOG: MiniAppCatalogItem[] = [
  { id: 'learn', name: 'Learn', description: 'Skills, subjects, coaching', color: '#38BDF8', route: '/mini-apps/learn' },
  { id: 'tasks', name: 'Tasks', description: 'Priorities & due dates', color: '#4F7DF3', route: '/mini-apps/tasks' },
  { id: 'planner', name: 'Planner', description: 'Morning · afternoon · evening', color: '#7C6CE8', route: '/mini-apps/planner' },
  { id: 'notes', name: 'Notes', description: 'Ideas, meetings, checklists', color: '#F59E0B', route: '/mini-apps/notes' },
  { id: 'pomodoro', name: 'Pomodoro', description: 'Focus & break timer', color: '#EF4444', route: '/mini-apps/pomodoro' },
  { id: 'habits', name: 'Habits', description: 'Daily streaks & goals', color: '#10B981', route: '/mini-apps/habits' },
  { id: 'expenses', name: 'Money', description: 'Budgets, spend, decisions', color: '#8B5CF6', route: '/mini-apps/expenses' },
  { id: 'shopping-list', name: 'Shopping', description: 'Groceries & essentials', color: '#12A878', route: '/mini-apps/shopping-list' },
  { id: 'fitness', name: 'Fitness', description: 'Meals, workouts, body metrics', color: '#14B8A6', route: '/mini-apps/fitness' },
  { id: 'calculator', name: 'Calculator', description: 'Math, units, shared bills', color: '#3B82F6', route: '/mini-apps/calculator' },
  { id: 'voice-memo', name: 'Voice Memo', description: 'Record thoughts fast', color: '#EF4444', route: '/mini-apps/voice-memo' },
  { id: 'camera', name: 'Camera', description: 'Photos, proof, captures', color: '#6366F1', route: '/mini-apps/camera' },
  { id: 'world-clock', name: 'World Clock', description: 'Time zones & meetings', color: '#0EA5E9', route: '/mini-apps/world-clock' },
  { id: 'markdown', name: 'Markdown', description: 'Drafts, docs, publishing', color: '#64748B', route: '/mini-apps/markdown' },
  { id: 'password-gen', name: 'Passwords', description: 'Secure generator', color: '#10B981', route: '/mini-apps/password-gen' },
];

export function miniAppById(id: string): MiniAppCatalogItem | undefined {
  return MINI_APP_CATALOG.find(app => app.id === id);
}
