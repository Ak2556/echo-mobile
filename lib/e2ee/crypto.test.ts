import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  E2EEError,
  generateDeviceKeyPair,
  openBody,
  openMessageKey,
  resealBody,
  sealMessage,
  verifyDisclosure,
  type DeviceKeyPair,
  type MessageContext,
} from './crypto';

const random = (n: number) => new Uint8Array(randomBytes(n));
const device = (deviceId: string) => ({ deviceId, keyPair: generateDeviceKeyPair(random) });
const target = (d: { deviceId: string; keyPair: DeviceKeyPair }) => ({ deviceId: d.deviceId, publicKey: d.keyPair.publicKey });
const ctx: MessageContext = { messageId: 'm-1', conversationId: 'c-1', senderId: 'u-sender' };

function readAs(d: { deviceId: string; keyPair: DeviceKeyPair }, sealed: ReturnType<typeof sealMessage>, context = ctx) {
  const row = sealed.keys.find(k => k.deviceId === d.deviceId);
  if (!row) throw new Error('no key row for device');
  const mk = openMessageKey(row, sealed.ephemeralPublicKey, d, context.messageId);
  return openBody(sealed.ciphertext, sealed.nonce, mk, context);
}

describe('device keys', () => {
  it('produces 32-byte hex keys', () => {
    const kp = generateDeviceKeyPair(random);
    expect(kp.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.publicKey).not.toBe(kp.privateKey);
  });
});

describe('sealMessage / open', () => {
  it('round-trips for the recipient', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('hello bob', ctx, [target(bob)], random);
    expect(readAs(bob, sealed)).toBe('hello bob');
  });

  it('round-trips unicode', () => {
    const bob = device('d-bob');
    const text = 'नमस्ते 👋 — ça va?';
    expect(readAs(bob, sealMessage(text, ctx, [target(bob)], random))).toBe(text);
  });

  it('gives every target device its own key row, and each can read', () => {
    const devices = [device('d-1'), device('d-2'), device('d-3')];
    const sealed = sealMessage('three devices', ctx, devices.map(target), random);
    expect(sealed.keys).toHaveLength(3);
    for (const d of devices) expect(readAs(d, sealed)).toBe('three devices');
  });

  it('collapses duplicate target devices to one key row', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('once', ctx, [target(bob), target(bob)], random);
    expect(sealed.keys).toHaveLength(1);
  });

  it('refuses to seal for nobody', () => {
    expect(() => sealMessage('x', ctx, [], random)).toThrowError(E2EEError);
  });

  it('a device that was not a target cannot open the key', () => {
    const bob = device('d-bob');
    const eve = device('d-eve');
    const sealed = sealMessage('not for eve', ctx, [target(bob)], random);
    const bobsRow = sealed.keys[0];
    expect(() => openMessageKey(bobsRow, sealed.ephemeralPublicKey, { ...eve, deviceId: 'd-bob' }, ctx.messageId))
      .toThrowError(E2EEError);
  });

  it('tampered ciphertext fails authentication instead of returning garbage', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('intact', ctx, [target(bob)], random);
    const flipped = (sealed.ciphertext[0] === '0' ? '1' : '0') + sealed.ciphertext.slice(1);
    expect(() => readAs(bob, { ...sealed, ciphertext: flipped })).toThrowError(E2EEError);
  });

  it('a tampered wrapped key fails authentication', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('intact', ctx, [target(bob)], random);
    const k = sealed.keys[0];
    const bad = { ...k, wrappedKey: (k.wrappedKey[0] === '0' ? '1' : '0') + k.wrappedKey.slice(1) };
    expect(() => openMessageKey(bad, sealed.ephemeralPublicKey, bob, ctx.messageId)).toThrowError(E2EEError);
  });

  it('binds the body to its message, conversation and sender', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('bound', ctx, [target(bob)], random);
    const mk = openMessageKey(sealed.keys[0], sealed.ephemeralPublicKey, bob, ctx.messageId);
    for (const moved of [
      { ...ctx, messageId: 'm-2' },
      { ...ctx, conversationId: 'c-2' },
      { ...ctx, senderId: 'u-impostor' },
    ]) {
      expect(() => openBody(sealed.ciphertext, sealed.nonce, mk, moved)).toThrowError(E2EEError);
    }
  });

  it('binds a wrapped key to its message and device', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('bound', ctx, [target(bob)], random);
    expect(() => openMessageKey(sealed.keys[0], sealed.ephemeralPublicKey, bob, 'm-other')).toThrowError(E2EEError);
    expect(() => openMessageKey(sealed.keys[0], sealed.ephemeralPublicKey, { ...bob, deviceId: 'd-other' }, ctx.messageId))
      .toThrowError(E2EEError);
  });

  it('never carries the plaintext in its output', () => {
    const bob = device('d-bob');
    const secret = 'SECRET-PLAINTEXT-7f3a';
    const sealed = sealMessage(secret, ctx, [target(bob)], random);
    const { messageKey: _mk, ...wire } = sealed;
    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(Buffer.from(secret).toString('hex'));
  });
});

describe('resealBody (edits)', () => {
  it('re-encrypts under the same message key with a fresh nonce', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('before', ctx, [target(bob)], random);
    const edited = resealBody('after', sealed.messageKey, ctx, random);
    expect(edited.nonce).not.toBe(sealed.nonce);
    const mk = openMessageKey(sealed.keys[0], sealed.ephemeralPublicKey, bob, ctx.messageId);
    expect(openBody(edited.ciphertext, edited.nonce, mk, ctx)).toBe('after');
  });
});

describe('verifyDisclosure (reports)', () => {
  it('accepts the true plaintext and rejects an invented one', () => {
    const bob = device('d-bob');
    const sealed = sealMessage('what was really said', ctx, [target(bob)], random);
    const mkHex = Buffer.from(sealed.messageKey).toString('hex');
    expect(verifyDisclosure('what was really said', sealed.ciphertext, sealed.nonce, mkHex, ctx)).toBe(true);
    expect(verifyDisclosure('something worse', sealed.ciphertext, sealed.nonce, mkHex, ctx)).toBe(false);
    expect(verifyDisclosure('what was really said', sealed.ciphertext, sealed.nonce, '00'.repeat(32), ctx)).toBe(false);
  });
});
