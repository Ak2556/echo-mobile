import { describe, expect, it } from 'vitest';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import {
  DecryptionError,
  ENCRYPTION_VERSION,
  decryptMessage,
  encryptForRecipients,
  generateKeyPair,
  safetyNumber,
  type WrappedKey,
} from './crypto';

const rand = (n: number) => new Uint8Array(nodeRandomBytes(n));
const keypair = () => generateKeyPair(rand);
const keyFor = (msg: { keys: WrappedKey[] }, userId: string) =>
  msg.keys.find(k => k.recipientId === userId)!;

describe('generateKeyPair', () => {
  it('produces distinct base64 keys', () => {
    const a = keypair();
    const b = keypair();
    expect(a.publicKey).not.toBe(a.secretKey);
    expect(a.publicKey).not.toBe(b.publicKey);
    // Curve25519 keys are 32 bytes -> 44 base64 chars.
    expect(a.publicKey).toHaveLength(44);
  });

  it('refuses a randomness source of the wrong length', () => {
    expect(() => generateKeyPair(() => new Uint8Array(8))).toThrow(/wrong length/i);
  });
});

describe('1:1', () => {
  it('round-trips a message', () => {
    const alice = keypair();
    const bob = keypair();
    const msg = encryptForRecipients('meet at 6', [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);

    expect(msg.encryptionVersion).toBe(ENCRYPTION_VERSION);
    expect(decryptMessage(msg, keyFor(msg, 'bob'), bob.secretKey)).toBe('meet at 6');
  });

  it('never puts the plaintext in the ciphertext', () => {
    const alice = keypair();
    const bob = keypair();
    const msg = encryptForRecipients('my password is hunter2', [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);
    expect(msg.ciphertext).not.toContain('hunter2');
    expect(JSON.stringify(msg)).not.toContain('hunter2');
  });

  it('produces different ciphertext for the same body each time', () => {
    const alice = keypair();
    const bob = keypair();
    const to = [{ userId: 'bob', publicKey: bob.publicKey }];
    const a = encryptForRecipients('same', to, alice, rand);
    const b = encryptForRecipients('same', to, alice, rand);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('handles unicode and emoji', () => {
    const alice = keypair();
    const bob = keypair();
    const body = 'नमस्ते 🌙 مرحبا';
    const msg = encryptForRecipients(body, [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);
    expect(decryptMessage(msg, keyFor(msg, 'bob'), bob.secretKey)).toBe(body);
  });
});

describe('groups', () => {
  it('lets every member decrypt, with one body for all of them', () => {
    const sender = keypair();
    const members = ['b', 'c', 'd', 'e'].map(id => ({ id, kp: keypair() }));
    const msg = encryptForRecipients(
      'dinner friday?',
      members.map(m => ({ userId: m.id, publicKey: m.kp.publicKey })),
      sender,
      rand,
    );

    expect(msg.keys).toHaveLength(4);
    for (const m of members) {
      expect(decryptMessage(msg, keyFor(msg, m.id), m.kp.secretKey)).toBe('dinner friday?');
    }
  });

  it('costs one wrapped key per member and only one ciphertext', () => {
    const sender = keypair();
    const ten = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, publicKey: keypair().publicKey }));
    const msg = encryptForRecipients('x'.repeat(5000), ten, sender, rand);
    expect(msg.keys).toHaveLength(10);
    // The body is sealed once; group size must not multiply it.
    expect(msg.ciphertext.length).toBeLessThan(8000);
  });

  it('does not let a non-recipient decrypt, even with a valid key of their own', () => {
    const sender = keypair();
    const bob = keypair();
    const eve = keypair();
    const msg = encryptForRecipients('private', [{ userId: 'bob', publicKey: bob.publicKey }], sender, rand);

    // Eve grabs Bob's wrapped key from the wire and tries her own secret key.
    expect(() => decryptMessage(msg, keyFor(msg, 'bob'), eve.secretKey)).toThrow(DecryptionError);
  });
});

describe('refusing to send', () => {
  it('throws rather than encrypting to nobody', () => {
    expect(() => encryptForRecipients('hi', [], keypair(), rand)).toThrow(/no recipients/i);
  });

  it('throws when a recipient has no key — never falls back to plaintext', () => {
    const sender = keypair();
    const ok = keypair();
    expect(() =>
      encryptForRecipients('hi', [
        { userId: 'has-key', publicKey: ok.publicKey },
        { userId: 'no-key', publicKey: '' },
      ], sender, rand),
    ).toThrow(/no encryption key for no-key/i);
  });
});

describe('tampering', () => {
  it('rejects an altered ciphertext', () => {
    const alice = keypair();
    const bob = keypair();
    const msg = encryptForRecipients('transfer 100', [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);

    const bytes = Buffer.from(msg.ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = { ...msg, ciphertext: bytes.toString('base64') };

    expect(() => decryptMessage(tampered, keyFor(msg, 'bob'), bob.secretKey)).toThrow(DecryptionError);
  });

  it('rejects an altered wrapped key', () => {
    const alice = keypair();
    const bob = keypair();
    const msg = encryptForRecipients('hello', [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);

    const own = keyFor(msg, 'bob');
    const bytes = Buffer.from(own.wrappedKey, 'base64');
    bytes[0] ^= 0xff;

    expect(() =>
      decryptMessage(msg, { ...own, wrappedKey: bytes.toString('base64') }, bob.secretKey),
    ).toThrow(DecryptionError);
  });

  it('rejects a swapped sender key', () => {
    const alice = keypair();
    const bob = keypair();
    const mallory = keypair();
    const msg = encryptForRecipients('hello', [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);

    const own = keyFor(msg, 'bob');
    expect(() =>
      decryptMessage(msg, { ...own, senderPublicKey: mallory.publicKey }, bob.secretKey),
    ).toThrow(DecryptionError);
  });

  it('rejects garbage rather than crashing', () => {
    const bob = keypair();
    const own: WrappedKey = { recipientId: 'bob', wrappedKey: '!!!', wrapNonce: '!!!', senderPublicKey: '!!!' };
    expect(() =>
      decryptMessage({ ciphertext: '!!!', nonce: '!!!' }, own, bob.secretKey),
    ).toThrow(DecryptionError);
  });

  it('refuses an unknown encryption version instead of guessing', () => {
    const alice = keypair();
    const bob = keypair();
    const msg = encryptForRecipients('hi', [{ userId: 'bob', publicKey: bob.publicKey }], alice, rand);
    expect(() =>
      decryptMessage({ ...msg, encryptionVersion: 99 }, keyFor(msg, 'bob'), bob.secretKey),
    ).toThrow(/unsupported encryption version/i);
  });
});

describe('safety number', () => {
  it('is identical for both participants regardless of order', () => {
    const a = keypair().publicKey;
    const b = keypair().publicKey;
    expect(safetyNumber(a, b)).toBe(safetyNumber(b, a));
  });

  it('changes when either key changes — this is the MITM signal', () => {
    const a = keypair().publicKey;
    const b = keypair().publicKey;
    const impostor = keypair().publicKey;
    expect(safetyNumber(a, b)).not.toBe(safetyNumber(a, impostor));
  });

  it('is readable aloud: 30 digits in groups of five', () => {
    const n = safetyNumber(keypair().publicKey, keypair().publicKey);
    expect(n).toMatch(/^\d{5}( \d{5}){5}$/);
  });
});
