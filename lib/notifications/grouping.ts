import type { Notification } from '../../types';

/**
 * Collapse repeated actions on the same thing into one row ("Ana and 3 others
 * liked your post"), newest first.
 *
 * Counts PEOPLE, not notifications. Grouping by (type, target) alone put 22
 * nudges from EchoX itself, which have no target, into "EchoX and 21 others"
 * (2026-11-27), and someone liking twice counted as two people. A bucket with
 * one sender is shown as its newest notification.
 *
 * targetPreview is left as it was: the row draws the name, the action and the
 * "and N others" line itself. Overwriting it with a sentence made rows whose
 * action text is the preview (nudges) print the count twice.
 */
export function groupNotifications(visible: Notification[]): Notification[] {
  const buckets = new Map<string, Notification[]>();
  for (const n of visible) {
    // Reactions and the preview together, so distinct reactions on the same
    // post stay in separate rows.
    const subkey = n.type === 'reaction' ? `${n.targetId ?? n.fromUserId}:${n.targetPreview ?? ''}` : (n.targetId ?? n.fromUserId);
    const k = `${n.type}:${subkey}`;
    const list = buckets.get(k);
    if (list) list.push(n); else buckets.set(k, [n]);
  }
  return Array.from(buckets.values())
    .map(list => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    .sort((a, b) => b[0].createdAt.localeCompare(a[0].createdAt))
    .map(list => {
      const newest = list[0];
      const people = new Set(list.map(n => n.fromUserId)).size;
      return people > 1 ? { ...newest, groupCount: people } : newest;
    });
}
