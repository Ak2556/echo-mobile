import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { generateDeviceKeyPair, openBody, openMessageKey, sealMessage } from './crypto';
import { clearMessageCache } from './cache';

const random = (n: number) => new Uint8Array(randomBytes(n));
const SECRET = 'SECRET-PLAINTEXT-7f3a';

const alice = { userId: 'u-alice', deviceId: 'd-alice', keyPair: generateDeviceKeyPair(random) };
const bob = { userId: 'u-bob', deviceId: 'd-bob', keyPair: generateDeviceKeyPair(random) };

const outgoing: { kind: 'insert' | 'rpc' | 'update'; table?: string; name?: string; payload: unknown }[] = [];
let conversation: { user_a: string; user_b: string | null; is_group: boolean } = { user_a: 'u-alice', user_b: 'u-bob', is_group: false };
let bobHasDevice = true;
let flagOn = true;
let registration: Promise<typeof alice> = Promise.resolve(alice);

vi.mock('../monitoring', () => ({ captureException: vi.fn() }));
vi.mock('../remoteFlags', () => ({ isFeatureEnabled: (flag: string) => flag === 'e2eeSend' && flagOn }));
vi.mock('./deviceKeys', () => ({
  ensureDeviceRegistered: () => registration,
  fetchTargetDevices: async (userIds: string[]) => [
    ...(bobHasDevice && userIds.includes('u-bob') ? [{ userId: 'u-bob', deviceId: bob.deviceId, publicKey: bob.keyPair.publicKey }] : []),
    ...(userIds.includes('u-alice') ? [{ userId: 'u-alice', deviceId: alice.deviceId, publicKey: alice.keyPair.publicKey }] : []),
  ],
  getLocalDevice: async () => alice,
}));
// device_id lets the fixture answer like the server does: only this device's rows.
let keyRows: { message_id: string; device_id: string; wrapped_key: string; nonce: string }[] = [];
let messageRow: Record<string, unknown> | null = null;
const updates: unknown[] = [];

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => { outgoing.push({ kind: 'insert', table, payload }); return Promise.resolve({ error: null }); },
      update: (payload: unknown) => {
        outgoing.push({ kind: 'update', table, payload });
        updates.push(payload);
        const chain = { eq: () => chain, then: (r: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(r) };
        return chain;
      },
      select: () => ({
        eq: (_col: string, value: string) => ({
          single: () => Promise.resolve({ data: table === 'dm_conversations' ? conversation : messageRow, error: null }),
          in: (_c: string, ids: string[]) =>
            Promise.resolve({ data: keyRows.filter(k => ids.includes(k.message_id) && k.device_id === value), error: null }),
        }),
      }),
    }),
    rpc: (name: string, payload: unknown) => { outgoing.push({ kind: 'rpc', name, payload }); return Promise.resolve({ data: null, error: null }); },
  },
}));

import { editDirectMessage, insertDirectMessage, readDirectMessages } from './messages';
import { isRecipientNotReady } from './crypto';

beforeEach(() => {
  outgoing.length = 0;
  conversation = { user_a: 'u-alice', user_b: 'u-bob', is_group: false };
  bobHasDevice = true;
  flagOn = true;
  registration = Promise.resolve(alice);
  keyRows = [];
  messageRow = null;
  updates.length = 0;
  clearMessageCache();
});

const send = (over: Partial<Parameters<typeof insertDirectMessage>[0]> = {}) =>
  insertDirectMessage({ conversationId: 'c-1', senderId: 'u-alice', kind: 'text', text: SECRET, ...over });

describe('sealed send', () => {
  it('no plaintext leaves the device', async () => {
    const sent = await send();
    expect(sent.encrypted).toBe(true);
    expect(outgoing).toHaveLength(1);
    const wire = JSON.stringify(outgoing);
    expect(wire).not.toContain(SECRET);
    expect(wire).not.toContain(Buffer.from(SECRET).toString('hex'));
  });

  it('the recipient and the sender can both read what was sent', async () => {
    const sent = await send();
    const { p_message, p_keys } = outgoing[0].payload as {
      p_message: { id: string; ciphertext: string; nonce: string; ephemeral_public_key: string };
      p_keys: { device_id: string; wrapped_key: string; nonce: string }[];
    };
    expect(p_message.id).toBe(sent.id);
    const ctx = { messageId: sent.id, conversationId: 'c-1', senderId: 'u-alice' };
    for (const d of [bob, alice]) {
      const row = p_keys.find(k => k.device_id === d.deviceId)!;
      const mk = openMessageKey({ wrappedKey: row.wrapped_key, nonce: row.nonce }, p_message.ephemeral_public_key, d, sent.id);
      expect(openBody(p_message.ciphertext, p_message.nonce, mk, ctx)).toBe(SECRET);
    }
  });

  it('fails the send, and writes nothing, when this device cannot register', async () => {
    registration = Promise.reject(new Error('keychain locked'));
    await expect(send()).rejects.toThrow('keychain locked');
    expect(outgoing).toHaveLength(0);
  });

  it('seals link, contact and echo payloads too', async () => {
    for (const kind of ['link', 'contact', 'echo'] as const) {
      outgoing.length = 0;
      await send({ kind, text: JSON.stringify({ url: 'https://x.test', note: SECRET }) });
      expect(JSON.stringify(outgoing)).not.toContain(SECRET);
    }
  });
});

describe('fail closed: no plaintext 1:1 text while e2eeSend is on', () => {
  it('refuses, and writes nothing, when the recipient has no device yet', async () => {
    bobHasDevice = false;
    for (const kind of ['text', 'link', 'contact', 'echo'] as const) {
      const err = await send({ kind }).catch(e => e);
      expect(isRecipientNotReady(err), kind).toBe(true);
    }
    expect(outgoing).toHaveLength(0);
  });

  it('still sends what E2EE does not cover yet: media, with no device on the other side', async () => {
    bobHasDevice = false;
    expect((await send({ kind: 'image', text: null, mediaUrl: 'k' })).encrypted).toBe(false);
    expect((await send({ kind: 'voice', text: '3', mediaUrl: 'k' })).encrypted).toBe(false);
  });
});

describe('visible plaintext fallbacks', () => {

  it('sends plaintext when e2eeSend is off', async () => {
    flagOn = false;
    expect((await send()).encrypted).toBe(false);
  });

  it('never seals a group conversation', async () => {
    conversation = { user_a: 'u-alice', user_b: null, is_group: true };
    expect((await send()).encrypted).toBe(false);
  });

  it('leaves image and voice messages as they are (media is a separate plan)', async () => {
    expect((await send({ kind: 'image', text: 'caption', mediaUrl: 'k' })).encrypted).toBe(false);
    expect((await send({ kind: 'voice', text: '3', mediaUrl: 'k' })).encrypted).toBe(false);
  });

  it('gives a plaintext row a client id too', async () => {
    flagOn = false;
    const sent = await send();
    expect((outgoing[0].payload as { id: string }).id).toBe(sent.id);
  });
});

function sealedRowFor(text: string, id: string, deviceIds: string[] = [alice.deviceId]) {
  const ctx = { messageId: id, conversationId: 'c-1', senderId: 'u-bob' };
  const devices = [alice, bob].filter(d => deviceIds.includes(d.deviceId));
  const sealed = sealMessage(text, ctx, devices.map(d => ({ deviceId: d.deviceId, publicKey: d.keyPair.publicKey })), random);
  for (const k of sealed.keys) keyRows.push({ message_id: id, device_id: k.deviceId, wrapped_key: k.wrappedKey, nonce: k.nonce });
  return {
    id, conversation_id: 'c-1', sender_id: 'u-bob', created_at: '2026-09-26T10:00:00Z', text: null,
    ciphertext: sealed.ciphertext, nonce: sealed.nonce, ephemeral_public_key: sealed.ephemeralPublicKey,
  };
}

describe('readDirectMessages', () => {
  it('decrypts rows sealed to this device and passes plaintext rows through', async () => {
    const sealed = sealedRowFor('for alice', 'm-1');
    const plain = { id: 'm-0', conversation_id: 'c-1', sender_id: 'u-bob', text: 'old plaintext', ciphertext: null, nonce: null, ephemeral_public_key: null };
    const out = await readDirectMessages([plain, sealed], 'u-alice');
    expect(out.get('m-0')).toEqual({ text: 'old plaintext', encrypted: false, unreadable: null });
    expect(out.get('m-1')).toEqual({ text: 'for alice', encrypted: true, unreadable: null });
  });

  it('says no_key, not an empty message, for a message sent before this device existed', async () => {
    const sealed = sealedRowFor('before my time', 'm-2', [bob.deviceId]);
    expect((await readDirectMessages([sealed], 'u-alice')).get('m-2')).toEqual({ text: null, encrypted: true, unreadable: 'no_key' });
  });

  it('says failed for a tampered message', async () => {
    const sealed = sealedRowFor('intact', 'm-3');
    const flipped = { ...sealed, ciphertext: (sealed.ciphertext[0] === '0' ? '1' : '0') + sealed.ciphertext.slice(1) };
    expect((await readDirectMessages([flipped], 'u-alice')).get('m-3')).toEqual({ text: null, encrypted: true, unreadable: 'failed' });
  });
});

describe('editDirectMessage', () => {
  it('re-seals an edit under the same key and sends no plaintext', async () => {
    const sent = await send();
    const rpc = outgoing.find(o => o.kind === 'rpc')!.payload as { p_message: { ciphertext: string; nonce: string; ephemeral_public_key: string } };
    messageRow = { id: sent.id, conversation_id: 'c-1', sender_id: 'u-alice', text: null, ...rpc.p_message };
    outgoing.length = 0;
    await editDirectMessage(sent.id, 'EDITED-SECRET-91c2', 'u-alice');
    const wire = JSON.stringify(outgoing);
    expect(wire).not.toContain('EDITED-SECRET-91c2');
    const patch = updates[0] as { ciphertext: string; nonce: string; edited_at: string };
    expect(patch.nonce).not.toBe(rpc.p_message.nonce);
    expect(patch).not.toHaveProperty('text');
  });

  it('edits a plaintext message as before', async () => {
    messageRow = { id: 'm-9', conversation_id: 'c-1', sender_id: 'u-alice', text: 'old', ciphertext: null, nonce: null, ephemeral_public_key: null };
    await editDirectMessage('m-9', 'new', 'u-alice');
    expect(updates[0]).toMatchObject({ text: 'new' });
  });
});
