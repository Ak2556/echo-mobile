/**
 * The only code that writes direct-message rows (lib/dmWriters.test.ts
 * enforces it).
 *
 * With e2eeSend on, every text/link/contact/echo message in a 1:1 chat is
 * sealed. If the recipient has no registered device the send fails
 * (E2EEError 'recipient_not_ready'): there is no plaintext fallback for 1:1
 * text. Plaintext remains only where E2EE does not reach: e2eeSend off (the kill
 * switch), group chats, and image/voice messages (media is a separate plan).
 * Those render without a lock, which is how a user can see the difference.
 *
 * Once a message is going to be sealed, every failure throws. There is no path
 * that writes plaintext because encryption did not work.
 */
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { supabase } from '../supabase';
import { isFeatureEnabled } from '../remoteFlags';
import { E2EEError, openBody, openMessageKey, resealBody, sealMessage, type TargetDevice } from './crypto';
import { ensureDeviceRegistered, fetchTargetDevices, getLocalDevice } from './deviceKeys';
import { recallMessage, rememberMessage } from './cache';
import { captureException } from '../monitoring';

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
  // Fail closed: the recipient cannot decrypt yet, and 1:1 text is never sent
  // in plaintext while e2eeSend is on. They register on their next sign-in to a
  // current build.
  if (!devices.some(d => d.userId === recipientId)) throw new E2EEError('recipient_not_ready');

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

export const SEALED_COLUMNS = 'ciphertext, nonce, ephemeral_public_key';

export type SealedRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at?: string;
  text: string | null;
  ciphertext: string | null;
  nonce: string | null;
  ephemeral_public_key: string | null;
};

export type Readable = { text: string | null; encrypted: boolean; unreadable: 'no_key' | 'failed' | null };

const KEY_LOOKUP_CHUNK = 100;

export async function readDirectMessages(rows: SealedRow[], userId: string): Promise<Map<string, Readable>> {
  const out = new Map<string, Readable>();
  const pending: SealedRow[] = [];

  for (const r of rows) {
    if (!r.ciphertext) { out.set(r.id, { text: r.text, encrypted: false, unreadable: null }); continue; }
    const hit = recallMessage(r.id, r.nonce ?? undefined);
    if (hit) { out.set(r.id, { text: hit.text, encrypted: true, unreadable: null }); continue; }
    pending.push(r);
  }
  if (pending.length === 0) return out;

  const device = await getLocalDevice(userId);
  if (!device) {
    for (const r of pending) out.set(r.id, { text: null, encrypted: true, unreadable: 'no_key' });
    return out;
  }

  const keys = new Map<string, { wrapped_key: string; nonce: string }>();
  for (let i = 0; i < pending.length; i += KEY_LOOKUP_CHUNK) {
    const ids = pending.slice(i, i + KEY_LOOKUP_CHUNK).map(r => r.id);
    const { data, error } = await supabase
      .from('direct_message_keys')
      .select('message_id, wrapped_key, nonce')
      .eq('device_id', device.deviceId)
      .in('message_id', ids);
    if (error) throw error;
    for (const k of (data ?? []) as { message_id: string; wrapped_key: string; nonce: string }[]) keys.set(k.message_id, k);
  }

  for (const r of pending) {
    const k = keys.get(r.id);
    if (!k) { out.set(r.id, { text: null, encrypted: true, unreadable: 'no_key' }); continue; }
    const ctx = { messageId: r.id, conversationId: r.conversation_id, senderId: r.sender_id };
    try {
      const messageKey = openMessageKey({ wrappedKey: k.wrapped_key, nonce: k.nonce }, r.ephemeral_public_key!, device, r.id);
      const text = openBody(r.ciphertext!, r.nonce!, messageKey, ctx);
      rememberMessage({ id: r.id, text, conversationId: r.conversation_id, senderId: r.sender_id, createdAt: r.created_at ?? '', nonce: r.nonce!, messageKey });
      out.set(r.id, { text, encrypted: true, unreadable: null });
    } catch (error) {
      // The error carries no content: E2EEError('decrypt_failed') only.
      captureException(error, { tags: { source: 'e2ee_decrypt' } });
      out.set(r.id, { text: null, encrypted: true, unreadable: 'failed' });
    }
  }
  return out;
}

export async function editDirectMessage(messageId: string, newText: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select(`id, conversation_id, sender_id, created_at, text, ${SEALED_COLUMNS}`)
    .eq('id', messageId)
    .single();
  if (error) throw error;
  const row = data as SealedRow;
  if (row.sender_id !== userId) throw new Error('Only the sender can edit a message');

  const editedAt = new Date().toISOString();
  if (!row.ciphertext) {
    const { error: updateError } = await supabase
      .from('direct_messages')
      .update({ text: newText, edited_at: editedAt })
      .eq('id', messageId)
      .eq('sender_id', userId);
    if (updateError) throw updateError;
    return;
  }

  let entry = recallMessage(messageId, row.nonce ?? undefined);
  if (!entry) {
    await readDirectMessages([row], userId);
    entry = recallMessage(messageId, row.nonce ?? undefined);
  }
  if (!entry) throw new E2EEError('no_key');

  const ctx = { messageId, conversationId: row.conversation_id, senderId: row.sender_id };
  const resealed = resealBody(newText, entry.messageKey, ctx, getRandomBytes);
  const { error: updateError } = await supabase
    .from('direct_messages')
    .update({ ciphertext: resealed.ciphertext, nonce: resealed.nonce, edited_at: editedAt })
    .eq('id', messageId)
    .eq('sender_id', userId);
  if (updateError) throw updateError;
  rememberMessage({ ...entry, text: newText, nonce: resealed.nonce });
}
