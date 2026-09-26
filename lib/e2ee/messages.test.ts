import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { generateDeviceKeyPair, openBody, openMessageKey } from './crypto';

const random = (n: number) => new Uint8Array(randomBytes(n));
const SECRET = 'SECRET-PLAINTEXT-7f3a';

const alice = { userId: 'u-alice', deviceId: 'd-alice', keyPair: generateDeviceKeyPair(random) };
const bob = { userId: 'u-bob', deviceId: 'd-bob', keyPair: generateDeviceKeyPair(random) };

const outgoing: { kind: 'insert' | 'rpc' | 'update'; table?: string; name?: string; payload: unknown }[] = [];
let conversation: { user_a: string; user_b: string | null; is_group: boolean } = { user_a: 'u-alice', user_b: 'u-bob', is_group: false };
let bobHasDevice = true;
let flagOn = true;
let registration: Promise<typeof alice> = Promise.resolve(alice);

vi.mock('../remoteFlags', () => ({ isFeatureEnabled: (flag: string) => flag === 'e2eeSend' && flagOn }));
vi.mock('./deviceKeys', () => ({
  ensureDeviceRegistered: () => registration,
  fetchTargetDevices: async (userIds: string[]) => [
    ...(bobHasDevice && userIds.includes('u-bob') ? [{ userId: 'u-bob', deviceId: bob.deviceId, publicKey: bob.keyPair.publicKey }] : []),
    ...(userIds.includes('u-alice') ? [{ userId: 'u-alice', deviceId: alice.deviceId, publicKey: alice.keyPair.publicKey }] : []),
  ],
  getLocalDevice: async () => alice,
}));
vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => { outgoing.push({ kind: 'insert', table, payload }); return Promise.resolve({ error: null }); },
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: conversation, error: null }) }) }),
    }),
    rpc: (name: string, payload: unknown) => { outgoing.push({ kind: 'rpc', name, payload }); return Promise.resolve({ data: null, error: null }); },
  },
}));

import { insertDirectMessage } from './messages';

beforeEach(() => {
  outgoing.length = 0;
  conversation = { user_a: 'u-alice', user_b: 'u-bob', is_group: false };
  bobHasDevice = true;
  flagOn = true;
  registration = Promise.resolve(alice);
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

describe('visible plaintext fallbacks', () => {
  it('sends plaintext when the recipient has no device yet', async () => {
    bobHasDevice = false;
    const sent = await send();
    expect(sent.encrypted).toBe(false);
    expect(outgoing[0]).toMatchObject({ kind: 'insert', table: 'direct_messages' });
  });

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
