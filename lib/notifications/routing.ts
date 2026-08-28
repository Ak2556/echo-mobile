/**
 * Where each kind of notification goes, and what it can do.
 *
 * Deliberately dependency-free: the `push-fanout` edge function imports this
 * same file under Deno to stamp `channelId` and `categoryId` on outgoing
 * pushes, while the app imports it to register the matching channels and
 * actions. Two copies of this map would drift, and the failure would be quiet —
 * a Reply button on a notification whose kind the client refuses to reply to,
 * or a push addressed to a channel the app never created.
 *
 * Anything imported here has to work in both runtimes, so: nothing.
 */

export const CHANNEL_MESSAGES = 'messages';
export const CHANNEL_SOCIAL = 'social';
export const CHANNEL_DAILY = 'daily';
export const CHANNEL_SYSTEM = 'system';

export const CATEGORY_DM = 'echo.dm';
export const CATEGORY_COMMENT = 'echo.comment';
export const ACTION_REPLY = 'echo.reply';

/**
 * Kinds where a typed reply makes sense.
 *
 * Deliberately narrow. "Someone liked your echo" could technically accept a
 * comment on your own post, but nobody means that when they type into a like
 * notification, and posting it publicly would be a nasty surprise.
 */
export const COMMENTABLE_KINDS = ['comment', 'mention', 'quote'];

/**
 * Which Android channel a push of this `kind` belongs in. Unknown kinds land in
 * social — the quietest channel a stranger's action can reach.
 */
export function channelForKind(kind: string | null | undefined): string {
  switch (kind) {
    case 'dm':
      return CHANNEL_MESSAGES;

    case 'daily_question':
    case 'daily_react':
    case 'friend_answer':
    case 'personal_nudge':
      return CHANNEL_DAILY;

    case 'appeal_resolved':
    case 'content_removed':
      return CHANNEL_SYSTEM;

    default:
      return CHANNEL_SOCIAL;
  }
}

/** The category to stamp on an outgoing push, or null when it takes no reply. */
export function categoryForKind(kind: string | null | undefined): string | null {
  if (kind === 'dm') return CATEGORY_DM;
  if (typeof kind === 'string' && COMMENTABLE_KINDS.indexOf(kind) !== -1) return CATEGORY_COMMENT;
  return null;
}

/**
 * FCM/APNs delivery priority. Android holds normal-priority messages until the
 * device leaves Doze, which can mean a DM landing tens of minutes late; the
 * kinds a person is actively waiting on need to bypass that. The rest stay
 * normal on purpose — high priority on every like is how an app earns a
 * battery-drain warning.
 */
export function priorityForKind(kind: string | null | undefined): 'high' | 'normal' {
  return kind === 'dm' || kind === 'appeal_resolved' || kind === 'content_removed'
    ? 'high'
    : 'normal';
}

/**
 * Kinds that always deliver, however many notifications the day has already
 * produced.
 *
 * The daily cap exists so an engagement loop cannot turn into a spam machine.
 * It must never swallow a message a person is waiting on, or a decision about
 * their account — those are not engagement, they are the product working.
 */
export function bypassesDailyCap(kind: string | null | undefined): boolean {
  return kind === 'dm' || kind === 'appeal_resolved' || kind === 'content_removed';
}

/**
 * How many non-essential pushes one person may receive in a rolling 24 hours.
 *
 * Six is roughly one every waking three hours: enough for the daily question, a
 * couple of friends' answers, and a reaction or two, without the app becoming
 * the thing you mute first. The in-app inbox is never capped — only delivery
 * is, so nothing is lost, it just waits to be found.
 */
export const DAILY_PUSH_CAP = 6;
