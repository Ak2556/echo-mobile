import { describe, expect, it } from 'vitest';
import { NOTIFICATIONS_PAGE_SIZE, nextNotificationOffset } from './paging';
import type { Notification } from '../../types';

/**
 * fetchRemoteNotifications was a bare `.limit(50)` with no range and no way to
 * ask for more, so a user's fifty-first notification did not exist: no "load
 * more", no empty state, the history just stopped. These pin the two decisions
 * that replace it — when to stop asking, and what to ask for next.
 */
const page = (n: number): Notification[] =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}` }) as Notification);

describe('nextNotificationOffset', () => {
  it('asks for more after a full page', () => {
    expect(nextNotificationOffset(page(NOTIFICATIONS_PAGE_SIZE), [page(NOTIFICATIONS_PAGE_SIZE)]))
      .toBe(NOTIFICATIONS_PAGE_SIZE);
  });

  it('stops on a short page', () => {
    // The only end signal available: a count is a second query and the total
    // moves as notifications arrive.
    expect(nextNotificationOffset(page(NOTIFICATIONS_PAGE_SIZE - 1), [page(NOTIFICATIONS_PAGE_SIZE - 1)]))
      .toBeUndefined();
  });

  it('stops on an empty page', () => {
    expect(nextNotificationOffset([], [page(NOTIFICATIONS_PAGE_SIZE), []])).toBeUndefined();
  });

  it('accumulates across pages', () => {
    const pages = [page(NOTIFICATIONS_PAGE_SIZE), page(NOTIFICATIONS_PAGE_SIZE)];
    expect(nextNotificationOffset(pages[1], pages)).toBe(NOTIFICATIONS_PAGE_SIZE * 2);
  });

  it('counts what is held, not pages times size', () => {
    // A page trimmed by a dismissal landing mid-scroll would otherwise push the
    // next offset past the rows it skipped, silently losing them.
    const pages = [page(NOTIFICATIONS_PAGE_SIZE), page(NOTIFICATIONS_PAGE_SIZE - 3)];
    // Short page ends it, but the arithmetic must still be sound when it does not.
    const full = [page(NOTIFICATIONS_PAGE_SIZE), page(NOTIFICATIONS_PAGE_SIZE)];
    expect(nextNotificationOffset(full[1], full)).toBe(60);
    expect(nextNotificationOffset(pages[1], pages)).toBeUndefined();
  });

  it('keeps the page small enough to be a scroll trigger', () => {
    // Each page costs a profile lookup and an echo lookup for its rows.
    expect(NOTIFICATIONS_PAGE_SIZE).toBeGreaterThanOrEqual(15);
    expect(NOTIFICATIONS_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
