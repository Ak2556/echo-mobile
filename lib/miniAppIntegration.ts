import type { Href } from 'expo-router';
import { MINI_APP_CATALOG, miniAppById, type MiniAppCatalogItem } from './miniAppCatalog';
import { TARGET_CATEGORIES, type TargetMiniAppId } from './targetCategories';

type MiniAppMetric = { label: string; value: string };

const NAME_ALIASES: Record<string, TargetMiniAppId> = {
  'bmi': 'fitness',
  'bmi calculator': 'fitness',
  'bmi calc': 'fitness',
  'body metrics': 'fitness',
  'converter': 'calculator',
  'unit converter': 'calculator',
  'bill-splitter': 'calculator',
  'bill splitter': 'calculator',
  'split bill': 'calculator',
  'shopping': 'shopping-list',
  'shopping list': 'shopping-list',
  'todo': 'tasks',
  'to-do': 'tasks',
  'to do': 'tasks',
  'password': 'password-gen',
  'passwords': 'password-gen',
  'security': 'password-gen',
  'world clock': 'world-clock',
  'time zones': 'world-clock',
  'timezone': 'world-clock',
  'markdown': 'markdown',
  'draft': 'markdown',
  'docs': 'markdown',
  'learn': 'learn',
  'learning': 'learn',
  'study': 'learn',
  'coach': 'learn',
  'teacher': 'learn',
  'classroom': 'learn',
  'voice memo': 'voice-memo',
  'day planner': 'planner',
};

const FALLBACK_RELATED: Partial<Record<TargetMiniAppId, TargetMiniAppId[]>> = {
  learn: ['notes', 'tasks', 'planner', 'pomodoro'],
  tasks: ['learn', 'planner', 'pomodoro', 'habits'],
  planner: ['learn', 'tasks', 'notes', 'habits'],
  calculator: ['expenses', 'shopping-list', 'world-clock', 'notes'],
  converter: ['calculator', 'expenses', 'shopping-list', 'notes'],
  'bill-splitter': ['expenses', 'calculator', 'shopping-list', 'notes'],
  pomodoro: ['learn', 'tasks', 'habits', 'planner'],
  'password-gen': ['notes', 'tasks', 'calculator', 'markdown'],
  'shopping-list': ['expenses', 'calculator', 'planner', 'notes'],
  bmi: ['fitness', 'habits', 'planner', 'notes'],
  fitness: ['habits', 'planner', 'shopping-list', 'notes'],
  camera: ['notes', 'fitness', 'voice-memo', 'tasks'],
  'voice-memo': ['notes', 'tasks', 'pomodoro', 'planner'],
  notes: ['learn', 'tasks', 'planner', 'markdown'],
  habits: ['tasks', 'pomodoro', 'fitness', 'planner'],
  expenses: ['shopping-list', 'calculator', 'notes', 'planner'],
  'world-clock': ['planner', 'notes', 'calculator', 'tasks'],
  markdown: ['notes', 'learn', 'camera', 'voice-memo'],
};

export function resolveMiniAppId(input: string | undefined): TargetMiniAppId | undefined {
  if (!input) return undefined;
  const normalized = input.trim().toLowerCase();
  if (miniAppById(normalized)) return normalized as TargetMiniAppId;
  if (NAME_ALIASES[normalized]) return NAME_ALIASES[normalized];
  return MINI_APP_CATALOG.find(app => app.name.toLowerCase() === normalized)?.id;
}

export function relatedMiniApps(appIdOrName: string | undefined, limit = 4): MiniAppCatalogItem[] {
  const appId = resolveMiniAppId(appIdOrName);
  if (!appId) return MINI_APP_CATALOG.slice(0, limit);

  const scores = new Map<TargetMiniAppId, number>();
  for (const category of TARGET_CATEGORIES) {
    const index = category.apps.indexOf(appId);
    if (index < 0) continue;
    category.apps.forEach((id, i) => {
      if (id === appId) return;
      const proximity = Math.max(1, 5 - Math.abs(index - i));
      scores.set(id, (scores.get(id) ?? 0) + proximity);
    });
  }

  for (const [i, id] of (FALLBACK_RELATED[appId] ?? []).entries()) {
    scores.set(id, (scores.get(id) ?? 0) + (8 - i));
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => miniAppById(id))
    .filter((app): app is MiniAppCatalogItem => Boolean(app))
    .slice(0, limit);
}

export function miniAppSnapshotText(input: {
  appName: string;
  headline: string;
  caption: string;
  metrics?: MiniAppMetric[];
  shareText?: string;
}): string {
  const metricLines = (input.metrics ?? [])
    .map(metric => `- ${metric.label}: ${metric.value}`)
    .join('\n');
  return [
    input.shareText || `${input.appName}: ${input.headline}`,
    input.caption,
    metricLines,
  ].filter(Boolean).join('\n\n');
}

export function miniAppDeepLink(app: MiniAppCatalogItem): Href {
  return app.route;
}
