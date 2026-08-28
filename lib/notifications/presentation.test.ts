import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TYPES,
  TYPE_COLOR,
  actionTextFor,
  destinationFor,
  summaryTextFor,
} from './presentation';

const FALLBACK = 'interacted with you';

describe('every notification type is presentable', () => {
  it.each(NOTIFICATION_TYPES)('%s has real copy, not the fallback', (type) => {
    // The fallback is what friend_post and social_task_update rendered for
    // months: the row said "interacted with you" while VoiceOver read the
    // correct sentence, because the two label functions had drifted.
    expect(actionTextFor(type, 'preview')).not.toBe(FALLBACK);
    expect(summaryTextFor(type, 'preview')).not.toBe(FALLBACK);
  });

  it.each(NOTIFICATION_TYPES)('%s has its own colour', (type) => {
    expect(TYPE_COLOR[type]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it.each(NOTIFICATION_TYPES)('%s routes somewhere deliberate', (type) => {
    expect(destinationFor(type)).toBeTruthy();
  });
});

describe('destinations that would otherwise 404', () => {
  it('sends daily-answer notifications to the daily question, not a thread', () => {
    // target_id on these is a daily_answers row. /thread/<answerId> opens a
    // thread that does not exist.
    expect(destinationFor('daily_react')).toBe('daily');
    expect(destinationFor('friend_answer')).toBe('daily');
  });

  it('keeps echo-shaped notifications on the thread route', () => {
    expect(destinationFor('like')).toBe('thread');
    expect(destinationFor('comment')).toBe('thread');
    expect(destinationFor('friend_post')).toBe('thread');
  });
});

describe('copy variants', () => {
  it('keeps the grouped wording terser than the row wording', () => {
    // "Ana and 3 others commented" reads correctly; "…commented on your echo"
    // does not, because the name prefix already carries the subject.
    expect(summaryTextFor('comment')).toBe('commented');
    expect(actionTextFor('comment')).toBe('commented on your echo');
  });

  it('falls back to the row wording when no terser form exists', () => {
    expect(summaryTextFor('like')).toBe(actionTextFor('like'));
  });
});

describe('the type list matches the database constraint', () => {
  it('lists exactly what notifications_type_check allows', () => {
    // A type present here but absent from the constraint fails its INSERT, and
    // every notification trigger swallows exceptions — so the feature goes
    // silently inert. That is exactly how friend_answer shipped dead.
    const sql = readFileSync(
      join(import.meta.dirname!, '..', '..', 'supabase', 'migrations',
           '20260828090000_allow_friend_answer_notification.sql'),
      'utf8',
    );
    const allowed = [...sql.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    expect([...NOTIFICATION_TYPES].sort()).toEqual([...new Set(allowed)].sort());
  });
});
