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
  { id: 'calculator', name: 'Calculator', description: 'Scientific & history', color: '#3B82F6', route: '/mini-apps/calculator' },
  { id: 'converter', name: 'Converter', description: 'Length · weight · temp', color: '#10B981', route: '/mini-apps/converter' },
  { id: 'bill-splitter', name: 'Bill Splitter', description: 'Tip & split bills', color: '#F59E0B', route: '/mini-apps/bill-splitter' },
  { id: 'pomodoro', name: 'Pomodoro', description: 'Focus & break timer', color: '#EF4444', route: '/mini-apps/pomodoro' },
  { id: 'password-gen', name: 'Passwords', description: 'Secure generator', color: '#8B5CF6', route: '/mini-apps/password-gen' },
  { id: 'world-clock', name: 'World Clock', description: 'Global timezones', color: '#06B6D4', route: '/mini-apps/world-clock' },
  { id: 'json-formatter', name: 'JSON Tools', description: 'Format & validate', color: '#F97316', route: '/mini-apps/json-formatter' },
  { id: 'markdown', name: 'Markdown', description: 'Write & preview', color: '#64748B', route: '/mini-apps/markdown' },
  { id: 'color-tools', name: 'Colors', description: 'HEX · RGB · palettes', color: '#EC4899', route: '/mini-apps/color-tools' },
  { id: 'bmi', name: 'BMI Calc', description: 'Health & body metrics', color: '#22C55E', route: '/mini-apps/bmi' },
  { id: 'fitness', name: 'Fitness Log', description: 'Meals · workouts · progress', color: '#14B8A6', route: '/mini-apps/fitness' },
  { id: 'camera', name: 'Camera', description: 'Photo & video capture', color: '#6366F1', route: '/mini-apps/camera' },
  { id: 'voice-memo', name: 'Voice Memo', description: 'Record & play audio', color: '#EF4444', route: '/mini-apps/voice-memo' },
  { id: 'notes', name: 'Notes', description: 'Quick notes & ideas', color: '#F59E0B', route: '/mini-apps/notes' },
  { id: 'habits', name: 'Habits', description: 'Daily streaks & goals', color: '#10B981', route: '/mini-apps/habits' },
  { id: 'expenses', name: 'Expenses', description: 'Income & budget log', color: '#8B5CF6', route: '/mini-apps/expenses' },
  { id: 'dice', name: 'Dice & Coin', description: 'Roll dice, flip coins', color: '#F97316', route: '/mini-apps/dice' },
  { id: 'video-player', name: 'Video Player', description: 'Pick & play videos', color: '#0EA5E9', route: '/mini-apps/video-player' },
];

export function miniAppById(id: string): MiniAppCatalogItem | undefined {
  return MINI_APP_CATALOG.find(app => app.id === id);
}
