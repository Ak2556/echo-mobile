import { describe, expect, it } from 'vitest';
import type { Notification } from '../../types';
import { groupNotifications } from './grouping';

const n = (id: string, type: string, from: string, at: string, extra: Partial<Notification> = {}) =>
  ({ id, type, fromUserId: from, fromUsername: from, fromDisplayName: from, createdAt: at, isRead: false, ...extra }) as Notification;

describe('groupNotifications', () => {
  it('counts people, so nudges from one sender are one row with no "and others"', () => {
    const nudges = Array.from({ length: 22 }, (_, i) =>
      n(`p${i}`, 'personal_nudge', 'echox', `2026-11-${String(10 + (i % 15)).padStart(2, '0')}T0${i % 10}:00:00Z`, { targetPreview: `nudge ${i}` }));
    const rows = groupNotifications(nudges);
    expect(rows).toHaveLength(1);
    expect(rows[0].groupCount).toBeUndefined();
    expect(rows[0].targetPreview).toMatch(/^nudge \d+$/);
  });

  it('groups different people acting on the same post and keeps the preview untouched', () => {
    const rows = groupNotifications([
      n('1', 'like', 'ana', '2026-11-20T10:00:00Z', { targetId: 'post1', targetPreview: 'my post' }),
      n('2', 'like', 'raj', '2026-11-21T10:00:00Z', { targetId: 'post1', targetPreview: 'my post' }),
      n('3', 'like', 'ana', '2026-11-22T10:00:00Z', { targetId: 'post1', targetPreview: 'my post' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].groupCount).toBe(2);
    expect(rows[0].id).toBe('3');
    expect(rows[0].targetPreview).toBe('my post');
  });

  it('orders rows newest first', () => {
    const rows = groupNotifications([
      n('a', 'follow', 'x', '2026-11-01T00:00:00Z'),
      n('b', 'follow', 'y', '2026-11-03T00:00:00Z'),
    ]);
    expect(rows.map(r => r.id)).toEqual(['b', 'a']);
  });
});
