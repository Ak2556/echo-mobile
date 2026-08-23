import { describe, expect, it } from 'vitest';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { encryptForRecipients, generateKeyPair } from './crypto';
import { readMessage, type StoredMessage } from './render';

const rand = (n: number) => new Uint8Array(nodeRandomBytes(n));

function encrypted(body: string) {
  const sender = generateKeyPair(rand);
  const reader = generateKeyPair(rand);
  const msg = encryptForRecipients(body, [{ userId: 'reader', publicKey: reader.publicKey }], sender, rand);
  const stored: StoredMessage = {
    id: 'm1',
    text: null,
    ciphertext: msg.ciphertext,
    nonce: msg.nonce,
    encryption_version: msg.encryptionVersion,
  };
  return { stored, ownKey: msg.keys[0], reader, sender };
}

describe('readMessage', () => {
  it('decrypts a message this device holds a key for', () => {
    const { stored, ownKey, reader } = encrypted('see you at 8');
    const out = readMessage(stored, ownKey, reader.secretKey);
    expect(out).toEqual({ state: 'decrypted', body: 'see you at 8' });
  });

  it('passes through pre-encryption messages unchanged', () => {
    // Rows written before E2EE shipped still have to render.
    const out = readMessage({ id: 'old', text: 'legacy message' }, undefined, 'irrelevant');
    expect(out).toEqual({ state: 'plaintext', body: 'legacy message' });
  });

  it('marks a message unreadable when this device has no key', () => {
    const { stored, reader } = encrypted('secret');
    const out = readMessage(stored, undefined, reader.secretKey);
    expect(out.state).toBe('unreadable');
    if (out.state === 'unreadable') expect(out.reason).toMatch(/different device/i);
  });

  it('marks it unreadable — never blank — when the key does not fit', () => {
    const { stored, ownKey } = encrypted('secret');
    const stranger = generateKeyPair(rand);
    const out = readMessage(stored, ownKey, stranger.secretKey);
    expect(out.state).toBe('unreadable');
    if (out.state === 'unreadable') expect(out.reason).toBeTruthy();
  });

  it('never returns the ciphertext as if it were the body', () => {
    const { stored, ownKey } = encrypted('classified');
    const stranger = generateKeyPair(rand);
    const out = readMessage(stored, ownKey, stranger.secretKey);
    expect(JSON.stringify(out)).not.toContain(stored.ciphertext!);
  });

  it('reports tampering rather than rendering something wrong', () => {
    const { stored, ownKey, reader } = encrypted('transfer 100');
    const bytes = Buffer.from(stored.ciphertext!, 'base64');
    bytes[bytes.length - 1] ^= 0xff;

    const out = readMessage({ ...stored, ciphertext: bytes.toString('base64') }, ownKey, reader.secretKey);
    expect(out.state).toBe('unreadable');
    if (out.state === 'unreadable') expect(out.reason).toMatch(/altered|authentication/i);
  });

  it('refuses a future encryption version instead of guessing', () => {
    const { stored, ownKey, reader } = encrypted('hi');
    const out = readMessage({ ...stored, encryption_version: 99 }, ownKey, reader.secretKey);
    expect(out.state).toBe('unreadable');
    if (out.state === 'unreadable') expect(out.reason).toMatch(/version/i);
  });

  it('does not treat an empty legacy body as an error', () => {
    const out = readMessage({ id: 'm', text: null }, undefined, 'x');
    expect(out).toEqual({ state: 'plaintext', body: '' });
  });
});
