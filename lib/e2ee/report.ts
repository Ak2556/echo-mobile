/**
 * What a participant's device discloses when they report a sealed message.
 * Only on an explicit report, and only these: the message, its key (so a
 * moderator can verify the text against the stored ciphertext), and up to
 * DISCLOSURE_CONTEXT_LIMIT earlier messages from the same chat, for context.
 */
import { bytesToHex } from '@noble/ciphers/utils.js';
import { recallConversation, recallMessage } from './cache';

export const DISCLOSURE_CONTEXT_LIMIT = 5;

export type Disclosure = {
  content: string;
  messageKey: string;
  context: { senderId: string; text: string; createdAt: string }[];
};

export function buildDisclosure(messageId: string): Disclosure | null {
  const target = recallMessage(messageId);
  if (!target) return null;
  const context = recallConversation(target.conversationId)
    .filter(m => m.id !== target.id && m.createdAt < target.createdAt)
    .slice(-DISCLOSURE_CONTEXT_LIMIT)
    .map(m => ({ senderId: m.senderId, text: m.text, createdAt: m.createdAt }));
  return { content: target.text, messageKey: bytesToHex(target.messageKey), context };
}
