/**
 * Sending and reading end-to-end encrypted direct messages.
 *
 * This is the seam between the pure crypto in crypto.ts and the app. It holds
 * one rule above all others:
 *
 *   IF A MESSAGE CANNOT BE ENCRYPTED, IT IS NOT SENT.
 *
 * The previous attempt at E2EE in this codebase fell back to plaintext when a
 * recipient had no key. That is worse than no encryption, because the UI still
 * claimed the conversation was private. Every failure here surfaces to the
 * user instead.
 */

import { supabase } from '../supabase';
import { encryptForRecipients, type WrappedKey } from './crypto';
import { deviceRandomBytes, getConversationRecipients, getDeviceKeyPair } from './keys';
import { readMessage, type ReadableMessage, type StoredMessage } from './render';

export { readMessage } from './render';
export type { ReadableMessage, StoredMessage } from './render';

/** Raised when a message cannot be sent encrypted. Never falls back. */
export class EncryptionUnavailableError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      missing.length
        ? `Can't send yet — ${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} not set up encryption on their device.`
        : "Can't send — this conversation has no recipients.",
    );
    this.name = 'EncryptionUnavailableError';
    this.missing = missing;
  }
}

/**
 * Encrypt and send, atomically.
 *
 * The RPC writes the message and every recipient's wrapped key in one
 * transaction and refuses a partial key set, so a group message can never be
 * readable by only some of its members.
 */
export async function sendEncryptedDM(
  conversationId: string,
  body: string,
  options: { kind?: string; replyToId?: string } = {},
): Promise<{ messageId: string }> {
  const { recipients, missing } = await getConversationRecipients(conversationId);
  if (missing.length || recipients.length === 0) {
    throw new EncryptionUnavailableError(missing);
  }

  const sender = await getDeviceKeyPair();
  const encrypted = encryptForRecipients(body, recipients, sender, deviceRandomBytes);

  const { data, error } = await supabase.rpc('send_encrypted_dm', {
    p_conversation_id: conversationId,
    p_ciphertext: encrypted.ciphertext,
    p_nonce: encrypted.nonce,
    p_encryption_version: encrypted.encryptionVersion,
    p_kind: options.kind ?? 'text',
    p_reply_to_id: options.replyToId ?? null,
    p_keys: encrypted.keys.map(k => ({
      recipient_id: k.recipientId,
      wrapped_key: k.wrappedKey,
      wrap_nonce: k.wrapNonce,
      sender_public_key: k.senderPublicKey,
    })),
  });

  if (error) throw error;
  return { messageId: data as string };
}

/**
 * Fetch this device's wrapped keys for a set of messages.
 *
 * RLS restricts the table to the caller's own rows, so this cannot return
 * anyone else's keys even if asked for them.
 */
export async function fetchOwnKeys(messageIds: string[]): Promise<Map<string, WrappedKey>> {
  if (messageIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('dm_message_keys')
    .select('message_id, wrapped_key, wrap_nonce, sender_public_key')
    .in('message_id', messageIds);
  if (error) throw error;

  const map = new Map<string, WrappedKey>();
  for (const row of data ?? []) {
    map.set(row.message_id, {
      recipientId: '',
      wrappedKey: row.wrapped_key,
      wrapNonce: row.wrap_nonce,
      senderPublicKey: row.sender_public_key,
    });
  }
  return map;
}

/** Decrypt a page of messages in one pass. */
export async function readThread(messages: StoredMessage[]): Promise<Map<string, ReadableMessage>> {
  const encrypted = messages.filter(m => m.ciphertext).map(m => m.id);
  const [keys, sender] = await Promise.all([fetchOwnKeys(encrypted), getDeviceKeyPair()]);

  const out = new Map<string, ReadableMessage>();
  for (const m of messages) {
    out.set(m.id, readMessage(m, keys.get(m.id), sender.secretKey));
  }
  return out;
}
