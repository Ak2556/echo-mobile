/**
 * The only code that writes direct-message rows (lib/dmWriters.test.ts
 * enforces it).
 *
 * A message is sealed when all of these hold: it is text/link/contact/echo,
 * e2eeSend is on, the conversation is 1:1, and the recipient has published at
 * least one device key. Otherwise it goes out as before, and it renders
 * without a lock, which is how a user can see the difference.
 *
 * Once a message is going to be sealed, every failure throws. There is no path
 * that writes plaintext because encryption did not work.
 */
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { supabase } from '../supabase';
import { isFeatureEnabled } from '../remoteFlags';
import { sealMessage, type TargetDevice } from './crypto';
import { ensureDeviceRegistered, fetchTargetDevices } from './deviceKeys';
import { rememberMessage } from './cache';

export type DMKind = 'text' | 'link' | 'contact' | 'echo' | 'image' | 'voice';

export type OutgoingDirectMessage = {
  conversationId: string;
  senderId: string;
  kind: DMKind;
  text: string | null;
  mediaUrl?: string | null;
  sharedEchoId?: string | null;
  replyToId?: string | null;
};

export const ENCRYPTABLE_KINDS: ReadonlySet<string> = new Set(['text', 'link', 'contact', 'echo']);

async function sealTargets(msg: OutgoingDirectMessage): Promise<TargetDevice[] | null> {
  if (msg.text == null || !ENCRYPTABLE_KINDS.has(msg.kind)) return null;
  if (!isFeatureEnabled('e2eeSend')) return null;

  const { data: conv, error } = await supabase
    .from('dm_conversations')
    .select('user_a, user_b, is_group')
    .eq('id', msg.conversationId)
    .single();
  if (error) throw error;
  const c = conv as { user_a: string; user_b: string | null; is_group: boolean };
  if (c.is_group || !c.user_b) return null;

  const recipientId = c.user_a === msg.senderId ? c.user_b : c.user_a;
  const devices = await fetchTargetDevices([recipientId, msg.senderId]);
  // Phase-2 fallback: the recipient cannot decrypt yet. Sent without a lock.
  if (!devices.some(d => d.userId === recipientId)) return null;

  // From here on, failure fails the send.
  const self = await ensureDeviceRegistered(msg.senderId);
  const targets = new Map<string, TargetDevice>(devices.map(d => [d.deviceId, { deviceId: d.deviceId, publicKey: d.publicKey }]));
  targets.set(self.deviceId, { deviceId: self.deviceId, publicKey: self.keyPair.publicKey });
  return [...targets.values()];
}

export async function insertDirectMessage(msg: OutgoingDirectMessage): Promise<{ id: string; encrypted: boolean }> {
  const id = randomUUID();
  const targets = await sealTargets(msg);

  if (!targets) {
    const { error } = await supabase.from('direct_messages').insert({
      id,
      conversation_id: msg.conversationId,
      sender_id: msg.senderId,
      kind: msg.kind,
      text: msg.text,
      media_url: msg.mediaUrl ?? null,
      shared_echo_id: msg.sharedEchoId ?? null,
      ...(msg.replyToId ? { reply_to_id: msg.replyToId } : {}),
    });
    if (error) throw error;
    return { id, encrypted: false };
  }

  const ctx = { messageId: id, conversationId: msg.conversationId, senderId: msg.senderId };
  const sealed = sealMessage(msg.text!, ctx, targets, getRandomBytes);
  const { error } = await supabase.rpc('send_encrypted_dm', {
    p_message: {
      id,
      conversation_id: msg.conversationId,
      kind: msg.kind,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      ephemeral_public_key: sealed.ephemeralPublicKey,
      shared_echo_id: msg.sharedEchoId ?? '',
      reply_to_id: msg.replyToId ?? '',
    },
    p_keys: sealed.keys.map(k => ({ device_id: k.deviceId, wrapped_key: k.wrappedKey, nonce: k.nonce })),
  });
  if (error) throw error;

  rememberMessage({
    id,
    text: msg.text!,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    createdAt: new Date().toISOString(),
    nonce: sealed.nonce,
    messageKey: sealed.messageKey,
  });
  return { id, encrypted: true };
}
