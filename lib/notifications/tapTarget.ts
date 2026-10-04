/**
 * Where a tap on a notification lands. One resolver for the two places a
 * notification is tapped: the push in the shade (app/_layout.tsx) and a row in
 * the inbox (app/(tabs)/notifications.tsx).
 *
 * They used to keep separate tables, and the push one had a kind list of its own
 * that lacked friend_post, friend_answer, social_task_update, content_removed and
 * report_resolved: a tap on any of them did nothing but open the app, and
 * friend_post is the second most common kind the database creates. The kinds
 * come from presentation.ts, which mirrors notifications_type_check, so adding
 * one to the database forces a decision here (tapTarget.test.ts fails until it
 * has one).
 *
 * Pure, with no React Native imports, so the tests run under node.
 */

import { safeRouteId } from '../routing/urlSafety';
import { NOTIFICATION_TYPES, destinationFor } from './presentation';

export type TapRoute = string | { pathname: string; params: Record<string, string> };

/** Where a tap goes when it has nowhere more specific to go. */
export const INBOX = '/(tabs)/notifications';

/** Sent as a push but never stored as a row: the daily broadcast and the chat check-in. */
export const PUSH_ONLY_KINDS = ['daily_question', 'echo_checkin'];

/**
 * Reminders the app schedules on the device itself (lib/mini-apps/*Reminders.ts,
 * the habit and timer alarms, streak milestones). They never go through the
 * server, so they are not in notifications_type_check, and the push handler's old
 * kind list did not know them either: tapping "Time to log your tasks" only opened
 * the app. Each maps to the screen it is about; a `route` in the payload wins.
 */
export const LOCAL_REMINDER_ROUTES: Record<string, string> = {
  task_reminder: '/mini-apps/tasks',
  khata_reminder: '/mini-apps/expenses',
  fitness_reminder: '/mini-apps/fitness',
  habit_reminder: '/mini-apps/habits',
  pomodoro_done: '/mini-apps/pomodoro',
  workout_rest: '/mini-apps/fitness',
  milestone: '/(tabs)/you',
};

const KNOWN_KINDS = new Set<string>([...NOTIFICATION_TYPES, ...PUSH_ONLY_KINDS, ...Object.keys(LOCAL_REMINDER_ROUTES)]);

export interface TapInput {
  kind: string;
  /** The row's target_id: an echo, a conversation, a decision, a daily answer or a task, by kind. */
  targetId?: unknown;
  /** Who did it. A follow has no target, only the follower. */
  actorId?: unknown;
  /** Where a nudge was raised: daily, dm, feed, marketplace. */
  surface?: unknown;
  /** A concrete in-app path carried by a mini-app usage nudge. */
  route?: unknown;
}

/** Only an in-app path: no scheme, no host, no traversal, nothing a router could misread. */
const IN_APP_PATH = /^\/(?!\/)[A-Za-z0-9_\-/[\]()]*$/;

function nudgeRoute(i: TapInput): TapRoute {
  const route = typeof i.route === 'string' ? i.route : '';
  if (IN_APP_PATH.test(route) && !route.includes('..')) return route;
  switch (String(i.surface ?? '')) {
    case 'daily': return '/daily-question';
    case 'dm': return '/messages';
    case 'feed': return '/(tabs)/home';
    case 'marketplace': return '/mini-apps/marketplace';
    default: return '/(tabs)/chat';
  }
}

/** The screen this notification opens, or null when it has no screen (or no usable id). */
export function tapRoute(i: TapInput): TapRoute | null {
  const kind = i.kind;
  if (!KNOWN_KINDS.has(kind)) return null;
  if (kind === 'daily_question') return '/daily-question';
  if (kind === 'echo_checkin') return '/(tabs)/chat';
  if (kind === 'personal_nudge') return nudgeRoute(i);
  if (kind in LOCAL_REMINDER_ROUTES) {
    const route = typeof i.route === 'string' ? i.route : '';
    return IN_APP_PATH.test(route) && !route.includes('..') ? route : LOCAL_REMINDER_ROUTES[kind];
  }

  const target = safeRouteId(i.targetId);
  switch (destinationFor(kind)) {
    case 'profile': {
      const id = safeRouteId(i.actorId) ?? target;
      return id ? { pathname: '/user/[id]', params: { id } } : null;
    }
    case 'thread': return target ? { pathname: '/thread/[id]', params: { id: target } } : null;
    case 'dm': return target ? { pathname: '/messages/[id]', params: { id: target } } : null;
    case 'daily': return '/daily-question';
    case 'appeal': return '/appeal';
    case 'appeal-decision': return target ? { pathname: '/appeal', params: { decisionId: target } } : '/appeal';
    case 'reports': return '/my-reports';
    case 'rules': return '/legal/rules';
    case 'tasks': return '/mini-apps/tasks';
    default: return null;
  }
}

/** A push tap always lands somewhere: the screen, or failing that the inbox. */
export function tapRouteOrInbox(i: TapInput): TapRoute {
  return tapRoute(i) ?? INBOX;
}

/** Reads the `data` an Expo push carries (see supabase/functions/push-fanout/deliver.ts). */
export function inputFromPush(data: unknown): TapInput | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const kind = typeof d.kind === 'string' ? d.kind : '';
  if (!kind) return null;
  return {
    kind,
    targetId: d.target_id ?? d.echo_id ?? d.user_id,
    actorId: d.actor_id,
    // Local nudges carry `surface`; the server's (personalized-fanout) carry it as target_kind.
    surface: d.surface ?? d.target_kind,
    route: d.route,
  };
}

export function tapRouteFromPush(data: unknown): TapRoute | null {
  const input = inputFromPush(data);
  return input ? tapRoute(input) : null;
}
