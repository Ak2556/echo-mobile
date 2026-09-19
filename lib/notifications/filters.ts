import type { Notification } from '../../types';

/**
 * The filter chips, and what each one keeps.
 *
 * One table rather than three parallel lists. The screen previously held the
 * filter ids in a `useState` union, the matching predicate in a `switch`, and
 * the chips in a literal array — and the array had five of the ten. `likes`,
 * `reactions`, `saves`, `quotes` and `reposts` were fully implemented and
 * completely unreachable: a working feature nobody could see, and nothing to
 * catch it because no single place claimed to hold the whole set.
 *
 * Ordered by how often the interaction happens rather than alphabetically, so
 * the chips a user reaches for are the ones that fit on screen before they have
 * to scroll the row.
 */
export const NOTIFICATION_FILTERS = [
  { id: 'all', labelKey: 'notif.filterAll' },
  { id: 'unread', labelKey: 'notif.filterUnread' },
  { id: 'mentions', labelKey: 'notif.filterMentions' },
  { id: 'replies', labelKey: 'notif.filterReplies' },
  { id: 'likes', labelKey: 'notif.filterLikes' },
  { id: 'reactions', labelKey: 'notif.filterReactions' },
  { id: 'reposts', labelKey: 'notif.filterReposts' },
  { id: 'quotes', labelKey: 'notif.filterQuotes' },
  { id: 'saves', labelKey: 'notif.filterSaves' },
  { id: 'follows', labelKey: 'notif.filterFollows' },
] as const;

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]['id'];

/**
 * Which notification type each chip narrows to.
 *
 * `all` and `unread` are absent because they are not type filters — one keeps
 * everything and the other reads `isRead`. Kept as a map so adding a chip
 * without deciding what it matches is a type error rather than a chip that
 * silently shows the whole list.
 */
const TYPE_FOR_FILTER: Record<
  Exclude<NotificationFilter, 'all' | 'unread'>,
  Notification['type']
> = {
  mentions: 'mention',
  replies: 'comment',
  likes: 'like',
  reactions: 'reaction',
  reposts: 'repost',
  quotes: 'quote',
  saves: 'bookmark',
  follows: 'follow',
};

export function matchesFilter(n: Notification, filter: NotificationFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !n.isRead;
  return n.type === TYPE_FOR_FILTER[filter];
}
