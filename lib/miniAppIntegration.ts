import type { Href } from 'expo-router';
import { MINI_APP_CATALOG, miniAppById, type MiniAppCatalogItem } from './miniAppCatalog';
import { TARGET_CATEGORIES, type TargetMiniAppId } from './targetCategories';

type MiniAppMetric = { label: string; value: string };

const NAME_ALIASES: Record<string, TargetMiniAppId> = {
  'bmi calculator': 'bmi',
  'bmi calc': 'bmi',
  'bill splitter': 'bill-splitter',
  'colors': 'color-tools',
  'json tools': 'json-formatter',
  'passwords': 'password-gen',
  'voice memo': 'voice-memo',
  'world clock': 'world-clock',
};

const FALLBACK_RELATED: Partial<Record<TargetMiniAppId, TargetMiniAppId[]>> = {
  calculator: ['expenses', 'bill-splitter', 'converter', 'notes'],
  converter: ['calculator', 'expenses', 'world-clock', 'notes'],
  'bill-splitter': ['expenses', 'calculator', 'notes', 'world-clock'],
  pomodoro: ['habits', 'notes', 'voice-memo', 'markdown'],
  'password-gen': ['notes', 'json-formatter', 'calculator'],
  'world-clock': ['notes', 'expenses', 'converter', 'bill-splitter'],
  'json-formatter': ['markdown', 'notes', 'pomodoro'],
  markdown: ['notes', 'pomodoro', 'json-formatter'],
  'color-tools': ['notes', 'camera', 'markdown'],
  bmi: ['fitness', 'habits', 'camera', 'notes'],
  fitness: ['habits', 'bmi', 'camera', 'expenses'],
  camera: ['notes', 'fitness', 'voice-memo', 'video-player'],
  'voice-memo': ['notes', 'pomodoro', 'habits', 'markdown'],
  notes: ['pomodoro', 'habits', 'voice-memo', 'markdown'],
  habits: ['pomodoro', 'notes', 'fitness', 'expenses'],
  expenses: ['calculator', 'bill-splitter', 'notes', 'habits'],
  dice: ['notes', 'video-player', 'pomodoro'],
  'video-player': ['notes', 'camera', 'pomodoro', 'dice'],
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
