// What a notification row becomes on the recipient's devices: preferences,
// the daily cap, copy, routing data, and one send per device.
//
// Shared by the push-fanout endpoint and the job worker, so both deliver the
// same way. Lookup failures throw (the caller retries); decisions not to push
// return { skipped }; a send returns every ticket's outcome.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { pushBody, pushTitle } from './copy.ts';
import { pruneDeadTokens, sendToExpo, tokensByUser } from '../_shared/expoPush.ts';
import type { TicketOutcome } from '../_shared/expoTickets.ts';
// Shared with the app so the channel/category ids can never drift apart: the
// client registers exactly what this stamps. See lib/notifications/routing.ts.
import {
  DAILY_PUSH_CAP,
  allowsKind,
  bypassesDailyCap,
  categoryForKind,
  channelForKind,
  priorityForKind,
} from '../../../lib/notifications/routing.ts';

export interface PushNotification {
  user_id: string;
  type: string;
  target_id?: string | null;
  target_kind?: string | null;
  actor_id?: string | null;
  preview?: string | null;
}

export type DeliveryResult = { skipped: string } | { outcome: TicketOutcome };

// deno-lint-ignore no-explicit-any
export async function deliverNotification(db: SupabaseClient<any, any, any>, body: PushNotification): Promise<DeliveryResult> {
  // Load the recipient's devices, prefs and the actor name in parallel.
  // allSettled so a failed actor lookup doesn't abort the notification.
  const [recipientResult, tokensResult, actorResult, unreadResult] = await Promise.allSettled([
    db.from('profiles').select('notification_prefs').eq('id', body.user_id).maybeSingle(),
    // Every device the account is signed in on. This read only
    // profiles.push_token, one column per account, so each new sign-in
    // silenced every other device.
    tokensByUser(db, [body.user_id]),
    body.actor_id
      ? db.from('profiles').select('display_name, username').eq('id', body.actor_id).maybeSingle()
      : Promise.resolve({ data: null as { display_name?: string; username?: string } | null }),
    // Real badge number. This used to be a hardcoded 1, so an iOS home screen
    // read "1" whether the user had one notification waiting or forty, and it
    // never went back down. Served by idx_notifications_user_unread, a partial
    // index on exactly this predicate.
    db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', body.user_id)
      .is('read_at', null),
  ]);

  // A failed lookup is not an answer: throw, so the caller retries.
  if (recipientResult.status === 'rejected') throw recipientResult.reason;
  if (tokensResult.status === 'rejected') throw tokensResult.reason;
  // supabase-js resolves query errors instead of rejecting; without this a
  // failed profile read looked like "no token" and the push was dropped.
  if (recipientResult.value.error) throw recipientResult.value.error;

  const recipient = recipientResult.value.data;
  const tokens = tokensResult.value.get(body.user_id) ?? [];
  if (!recipient || tokens.length === 0) {
    return { skipped: 'no token' };
  }

  // The switches in Notification Preferences are enforced here, which is the
  // only place they can be: the decision has to hold for a device that is
  // asleep. The notification row is still written, so the in-app inbox stays
  // complete — turning a kind off silences the buzz, it does not erase the
  // record.
  if (!allowsKind(recipient.notification_prefs as Record<string, unknown> | null, body.type)) {
    return { skipped: 'muted by user preference' };
  }

  // Daily delivery cap. The notification row is already written — the in-app
  // inbox is never capped — so nothing is lost here; it just isn't pushed.
  // Messages and moderation decisions bypass it: those are not engagement.
  if (!bypassesDailyCap(body.type)) {
    const { count: recentPushes } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', body.user_id)
      .not('type', 'in', '("dm","appeal_resolved","content_removed")')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((recentPushes ?? 0) > DAILY_PUSH_CAP) {
      return { skipped: 'daily cap' };
    }
  }

  const actorData = actorResult.status === 'fulfilled' ? actorResult.value.data : null;
  const actorName = actorData?.display_name || actorData?.username || 'Someone';
  const title = pushTitle(body.type, actorName, body.preview);
  const message = pushBody(body.type, actorName, body.preview);

  // data payload routes the tap. The client tap handler reads `kind` +
  // `target_id` from here and routes accordingly.
  const category = categoryForKind(body.type);
  const unread = unreadResult.status === 'fulfilled' ? (unreadResult.value.count ?? null) : null;

  const expoPayload = tokens.map((to) => ({
    to,
    title,
    body: message,
    sound: 'default',
    // Omitted rather than guessed when the count query failed — a wrong badge
    // that never clears is worse than no badge.
    ...(unread === null ? {} : { badge: unread }),
    // Android 8+ takes importance, sound and vibration from the channel, not
    // from this payload, so the channel is the only way to let someone mute
    // likes while keeping DMs. Unknown ids are safe: expo-notifications falls
    // back to its own channel rather than dropping the notification, so an
    // install running older JS still gets everything.
    channelId: channelForKind(body.type),
    // Draws the Reply button. Only set on kinds the client will actually act
    // on; a Reply button whose text goes nowhere is worse than no button.
    ...(category ? { categoryId: category } : {}),
    priority: priorityForKind(body.type),
    data: {
      kind: body.type,
      target_id: body.target_id ?? null,
      target_kind: body.target_kind ?? null,
      // Actor is the object of some notifications (e.g. follow has no target_id
      // — the tap should open the follower's profile).
      actor_id: body.actor_id ?? null,
    },
  }));

  // One ticket per device, each with its own status: HTTP 200 from Expo says
  // only that the request was accepted. From 2026-08-11 no FCM credential was
  // assigned, every ticket said InvalidCredentials inside a 200, and the push
  // stack was dead for weeks while reporting success. See _shared/expoTickets.
  const outcome = await sendToExpo(expoPayload);

  // Uninstalled apps and rotated installs. Without pruning, dead tokens stay on
  // file for ever and every later notification pays to deliver nothing.
  await pruneDeadTokens(db, outcome.dead);

  return { outcome };
}
