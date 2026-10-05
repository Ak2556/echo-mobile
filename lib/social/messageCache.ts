/**
 * Fold freshly fetched messages into a thread's cached pages, in place.
 *
 * A thread used to refetch every loaded page on every realtime event (a new
 * message, an edit, a read receipt, a reaction): one network round trip per page,
 * in sequence, and a brand-new list for the screen to re-layout each time. Now an
 * event fetches only the messages it names and this merges them, so the cost is
 * one round trip and a splice, however long the thread is.
 *
 * Layout: pages[0] is the newest block; each block reads oldest to newest.
 *
 * Rules, each one a place a naive "append it" goes wrong:
 *  - a message already cached is replaced where it is (edit, receipt, reaction);
 *  - our own optimistic bubble ("pending-<id>") is replaced by the real message
 *    in the same position, so a send never shows twice;
 *  - a message OLDER than everything loaded is dropped: it belongs to a page the
 *    user has not scrolled to, and appending it would put it at the bottom;
 *  - anything else is inserted in createdAt order, not blindly last, so an
 *    incoming message does not land after our still-pending reply.
 */
import type { InfiniteData } from '@tanstack/react-query';
import { pendingDMId } from './dmLocalIds';

export interface CachedMessage {
  id: string;
  createdAt: string;
}

export function mergeMessages<T extends CachedMessage>(
  data: InfiniteData<T[]> | undefined,
  incoming: T[],
): InfiniteData<T[]> | undefined {
  if (!data || incoming.length === 0) return data;
  let pages = data.pages.map((p) => p.slice());

  for (const msg of incoming) {
    const pending = pendingDMId(msg.id);
    let placed = false;
    pages = pages.map((page) => {
      const at = page.findIndex((m) => m.id === msg.id || m.id === pending);
      if (at < 0) return page;
      placed = true;
      const next = page.slice();
      next[at] = msg;
      return next;
    });
    if (placed) continue;

    const newest = pages[0] ?? [];
    const loaded = pages.flat();
    const oldestLoaded = loaded.length ? loaded.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b)) : null;
    // Older than everything loaded: not part of this view. (With nothing loaded
    // yet there is nothing to be older than, so the first message is kept.)
    if (oldestLoaded && msg.createdAt < oldestLoaded.createdAt) continue;
    let i = newest.length;
    while (i > 0 && newest[i - 1].createdAt > msg.createdAt) i--;
    const next = newest.slice();
    next.splice(i, 0, msg);
    pages[0] = next;
  }
  return { ...data, pages };
}
