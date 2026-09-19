import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOTIFICATION_FILTERS, matchesFilter, type NotificationFilter } from './filters';
import type { Notification } from '../../types';

/**
 * Five of the ten filters were unreachable.
 *
 * The screen held the ids in a useState union, the predicate in a switch, and
 * the chips in a literal array — and that array listed five. likes, reactions,
 * saves, quotes and reposts each had working filter logic and no way to select
 * them, which is the worst kind of missing feature: finished, paid for, and
 * invisible.
 *
 * Nothing caught it because no single place claimed to own the set. It does
 * now, and these tests check the two joins that were broken: every filter has a
 * label string, and every filter is rendered as a chip.
 */

const ROOT = resolve(__dirname, '..', '..');

const base: Notification = {
  id: 'n1',
  type: 'like',
  fromUserId: 'u1',
  fromUsername: 'someone',
  fromDisplayName: 'Someone',
  isRead: false,
  createdAt: new Date().toISOString(),
} as Notification;

const of = (type: Notification['type'], isRead = false): Notification =>
  ({ ...base, type, isRead }) as Notification;

describe('notification filters', () => {
  it('offers all ten', () => {
    expect(NOTIFICATION_FILTERS.length).toBe(10);
  });

  it('every filter has an i18n key that exists in the base strings', () => {
    // A chip whose key is missing renders the raw key — "notif.filterSaves" —
    // which is how a typo ships looking like a label.
    const i18n = readFileSync(join(ROOT, 'src/shared/lib/i18n.ts'), 'utf8');
    for (const f of NOTIFICATION_FILTERS) {
      expect(i18n, `${f.id} needs ${f.labelKey} in BASE_TRANSLATIONS`).toContain(`'${f.labelKey}':`);
    }
  });

  it('every filter is rendered as a chip', () => {
    // The actual bug: the screen mapped over its own hardcoded list. It must
    // map over this one.
    const screen = readFileSync(join(ROOT, 'app/(tabs)/notifications.tsx'), 'utf8');
    expect(screen, 'the chips must come from NOTIFICATION_FILTERS').toMatch(
      /NOTIFICATION_FILTERS\.map/,
    );
    expect(screen, 'no hand-maintained chip list may survive').not.toMatch(
      /\['all',\s*'unread'/,
    );
  });

  it('all keeps everything and unread reads isRead', () => {
    expect(matchesFilter(of('like', true), 'all')).toBe(true);
    expect(matchesFilter(of('like', false), 'unread')).toBe(true);
    expect(matchesFilter(of('like', true), 'unread')).toBe(false);
  });

  it.each([
    ['mentions', 'mention'],
    ['replies', 'comment'],
    ['likes', 'like'],
    ['reactions', 'reaction'],
    ['reposts', 'repost'],
    ['quotes', 'quote'],
    ['saves', 'bookmark'],
    ['follows', 'follow'],
  ] as const)('%s matches only %s', (filter, type) => {
    expect(matchesFilter(of(type), filter as NotificationFilter)).toBe(true);
    // A different type must not slip through — the saves/bookmark and
    // replies/comment pairs are the ones where the names do not match.
    const other = type === 'like' ? 'follow' : 'like';
    expect(matchesFilter(of(other), filter as NotificationFilter)).toBe(false);
  });

  it('read state does not affect a type filter', () => {
    // Only `unread` looks at isRead; the type chips must show both.
    expect(matchesFilter(of('bookmark', true), 'saves')).toBe(true);
    expect(matchesFilter(of('bookmark', false), 'saves')).toBe(true);
  });
});
