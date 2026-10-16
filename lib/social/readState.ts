export interface ReadableMessage { senderId: string; createdAt: string; readAt: string | null }

/**
 * Has the VIEWER read this message?
 *
 * A message with a receipt (`readAt`) is read. For someone else's message there is also my private
 * marker: the time I last opened the conversation, kept on the server whether or not I send receipts.
 * Without that, a person who turns receipts off would see every partner message as unread forever.
 * My own messages are read only when the partner has sent a receipt; my marker says nothing about them.
 */
export function isReadForViewer(msg: ReadableMessage, viewerId: string, marker: string | null | undefined): boolean {
  if (msg.readAt) return true;
  if (msg.senderId === viewerId) return false;
  return !!marker && Date.parse(msg.createdAt) <= Date.parse(marker);
}
