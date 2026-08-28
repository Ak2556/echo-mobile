import { updateRemoteProfile } from '../supabaseEchoApi';
import { useAppStore } from '../../store/useAppStore';

/**
 * Push the six notification switches to the server.
 *
 * They have to live server-side to mean anything: the decision whether to send
 * is taken by push-fanout while the device may be asleep, so a preference held
 * only on the phone can never be consulted. Until this existed the switches
 * were written to the local store and read by nobody.
 *
 * Only the keys push-fanout understands are sent (see prefKeyForKind), so a
 * rename on either side shows up as a switch that stops working rather than a
 * silent no-op on a key nothing reads.
 */
export function currentNotificationPrefs(): Record<string, boolean> {
  const s = useAppStore.getState();
  return {
    likes: s.notifyLikes,
    comments: s.notifyComments,
    follows: s.notifyFollows,
    dms: s.notifyDMs,
    reposts: s.notifyReposts,
    mentions: s.notifyMentions,
  };
}

/** Best-effort: a failed sync must not block the switch from moving. */
export async function syncNotificationPrefs(): Promise<void> {
  try {
    await updateRemoteProfile({ notification_prefs: currentNotificationPrefs() });
  } catch {
    // The local store keeps the user's choice; the next toggle retries.
  }
}

/** Apply server-stored preferences to the local store on sign-in. */
export function applyNotificationPrefs(prefs: Record<string, unknown> | null | undefined): void {
  if (!prefs) return;
  const s = useAppStore.getState();
  const set = (key: string, apply: (v: boolean) => void) => {
    if (typeof prefs[key] === 'boolean') apply(prefs[key] as boolean);
  };
  set('likes', s.setNotifyLikes);
  set('comments', s.setNotifyComments);
  set('follows', s.setNotifyFollows);
  set('dms', s.setNotifyDMs);
  set('reposts', s.setNotifyReposts);
  set('mentions', s.setNotifyMentions);
}
