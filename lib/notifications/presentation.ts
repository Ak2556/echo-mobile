/**
 * How each notification type reads and where it goes.
 *
 * There were two copies of this: `actionTextFor` in NotificationCard (the row a
 * user reads) and `labelForType` in the notifications screen (the grouped
 * summary, and the string handed to the screen reader). They had already
 * drifted — the screen knew about `friend_post` and `social_task_update`, the
 * card did not, so those rows rendered "interacted with you" to everyone while
 * VoiceOver read the correct thing.
 *
 * The two wordings are deliberately different and both are kept: a row says
 * "commented on your echo", a grouped summary says "commented" because it is
 * already prefixed with names. What is shared is the list of types, so adding
 * one to the database forces a decision here rather than silently falling
 * through.
 */

/**
 * Every type the database will accept, mirroring notifications_type_check.
 * Adding a value here without adding it to the constraint means inserts fail
 * silently — the notification triggers all swallow their exceptions so that a
 * failed notification can never block the action that caused it.
 */
export const NOTIFICATION_TYPES = [
  'like', 'comment', 'follow', 'repost', 'mention', 'dm', 'reaction',
  'bookmark', 'quote', 'report_resolved', 'content_removed',
  'appeal_resolved', 'daily_react', 'personal_nudge', 'friend_post',
  'social_task_update', 'friend_answer',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const REACTION_LABEL: Record<string, string> = {
  mind_blown: 'insightful',
  taking_notes: 'taking notes',
  agree: 'agree',
  disagree: 'rethink',
};

/** Notifications with no real actor — they show a type icon, not a face. */
export const SYSTEM_TYPES = new Set<string>([
  'report_resolved', 'content_removed', 'appeal_resolved', 'personal_nudge',
]);

/** Warm editorial palette (lib/avatarPalette.ts) — one hue per type. */
export const TYPE_COLOR: Record<string, string> = {
  like: '#A04E4E',
  comment: '#4E7A8B',
  follow: '#7A8B4E',
  repost: '#4E8B7A',
  mention: '#B08536',
  dm: '#5E748B',
  reaction: '#B35D6B',
  bookmark: '#8B6F4E',
  quote: '#8B5E7D',
  report_resolved: '#7A8B4E',
  content_removed: '#A04E4E',
  appeal_resolved: '#4E7A8B',
  daily_react: '#B35D6B',
  friend_post: '#4E8B7A',
  friend_answer: '#B08536',
  personal_nudge: '#8B6F4E',
  social_task_update: '#7A8B4E',
};

function reactionText(preview?: string | null): string {
  const label = preview ? REACTION_LABEL[preview] : '';
  return label ? `reacted: ${label}` : 'reacted to your echo';
}

/** The sentence shown on a notification row, after the actor's name. */
export function actionTextFor(type: string, preview?: string | null): string {
  switch (type) {
    case 'like': return 'liked your echo';
    case 'comment': return 'commented on your echo';
    case 'follow': return 'started following you';
    case 'repost': return 're-echoed your post';
    case 'mention': return 'mentioned you';
    case 'dm': return 'sent you a message';
    case 'reaction': return reactionText(preview);
    case 'bookmark': return 'saved your echo';
    case 'quote': return 'quoted your echo';
    case 'report_resolved': return preview ?? 'Your report has been reviewed';
    case 'content_removed': return preview ?? 'Content was removed';
    case 'appeal_resolved': return preview ?? 'Your appeal has been reviewed';
    case 'friend_post': return 'published a new echo';
    case 'friend_answer': return "answered today's question";
    case 'daily_react': return 'reacted to your answer';
    case 'personal_nudge': return preview ?? 'has something for you';
    case 'social_task_update':
      return preview ? `completed a task: ${preview}` : 'completed a task';
    default: return 'interacted with you';
  }
}

/**
 * The terser wording used where a name already precedes it — grouped rows
 * ("Ana and 3 others liked your echo") and the screen-reader summary.
 */
export function summaryTextFor(type: string, preview?: string | null): string {
  switch (type) {
    case 'comment': return 'commented';
    case 'follow': return 'followed you';
    case 'repost': return 're-echoed';
    case 'dm': return 'sent a message';
    case 'content_removed': return preview ?? 'Content was removed by a moderator';
    default: return actionTextFor(type, preview);
  }
}

/** Where tapping a notification should land. */
export type NotificationDestination =
  | 'profile' | 'thread' | 'dm' | 'daily' | 'appeal' | 'appeal-decision' | 'reports' | 'none';

export function destinationFor(type: string): NotificationDestination {
  switch (type) {
    case 'follow': return 'profile';
    case 'dm': return 'dm';
    case 'content_removed': return 'appeal-decision';
    case 'appeal_resolved': return 'appeal';
    case 'report_resolved': return 'reports';
    // target_id on these is a daily_answers row, not an echo — routing them to
    // /thread/<id> opens a thread that does not exist.
    case 'daily_react':
    case 'friend_answer': return 'daily';
    case 'personal_nudge': return 'none';
    default: return 'thread';
  }
}
