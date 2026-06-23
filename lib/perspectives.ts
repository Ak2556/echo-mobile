import type { PerspectiveCounts, PerspectiveType } from '../types';

export const PERSPECTIVE_TYPES: PerspectiveType[] = [
  'agree',
  'challenge',
  'reframe',
  'story',
  'evidence',
  'question',
];

export const PERSPECTIVE_LABELS: Record<PerspectiveType, string> = {
  agree: 'Agree',
  challenge: 'Challenge',
  reframe: 'Reframe',
  story: 'Story',
  evidence: 'Evidence',
  question: 'Question',
};

export const PERSPECTIVE_DESCRIPTIONS: Record<PerspectiveType, string> = {
  agree: 'Add support or build on the take.',
  challenge: 'Push back with a clear counterpoint.',
  reframe: 'Look at the question from another angle.',
  story: 'Share lived experience or a concrete example.',
  evidence: 'Add a source, data point, or reference.',
  question: 'Ask the next sharper question.',
};

export const EMPTY_PERSPECTIVE_COUNTS: PerspectiveCounts = {
  agree: 0,
  challenge: 0,
  reframe: 0,
  story: 0,
  evidence: 0,
  question: 0,
};

export function getPerspectiveLabel(type: PerspectiveType | undefined): string {
  return type ? PERSPECTIVE_LABELS[type] : PERSPECTIVE_LABELS.reframe;
}

export function getPerspectiveCountsTotal(counts: PerspectiveCounts | undefined): number {
  if (!counts) return 0;
  return PERSPECTIVE_TYPES.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
}

export function getTopPerspectiveSummary(counts: PerspectiveCounts | undefined, max = 3): string {
  if (!counts) return '';
  return PERSPECTIVE_TYPES
    .map(type => ({ type, count: counts[type] ?? 0 }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map(item => `${item.count} ${PERSPECTIVE_LABELS[item.type].toLowerCase()}${item.count === 1 ? '' : 's'}`)
    .join(' · ');
}

export function isValidSourceUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
