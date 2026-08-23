import { describe, expect, it } from 'vitest';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import {
  MAX_CONTEXT_MESSAGES,
  MAX_DISCLOSED_CHARS,
  DisclosureError,
  buildDisclosure,
  describeDisclosure,
  type EncryptedRecord,
} from './report';
import { decryptMessage, encryptForRecipients, generateKeyPair } from './crypto';

const rand = (n: number) => new Uint8Array(nodeRandomBytes(n));

/** A thread encrypted for `reader`, so the reporting device can read it. */
function thread(bodies: string[]) {
  const sender = generateKeyPair(rand);
  const reader = generateKeyPair(rand);
  const records: EncryptedRecord[] = bodies.map((body, i) => {
    const msg = encryptForRecipients(body, [{ userId: 'reader', publicKey: reader.publicKey }], sender, rand);
    return {
      id: `m${i}`,
      senderId: i % 2 === 0 ? 'sender' : 'reader',
      createdAt: new Date(Date.UTC(2026, 7, 23, 10, i)).toISOString(),
      ciphertext: msg.ciphertext,
      nonce: msg.nonce,
      encryptionVersion: msg.encryptionVersion,
      ownKey: msg.keys[0],
    };
  });
  const decrypt = (r: EncryptedRecord) => decryptMessage(r, r.ownKey!, reader.secretKey);
  return { records, decrypt };
}

describe('buildDisclosure', () => {
  it('discloses the reported message in plaintext', () => {
    const { records, decrypt } = thread(['hello', 'you are worthless', 'bye']);
    const d = buildDisclosure('m1', records, decrypt);

    expect(d.targetType).toBe('dm_message');
    expect(d.disclosedMessageId).toBe('m1');
    expect(d.disclosedContent).toBe('you are worthless');
  });

  it('includes surrounding context so intent is judgeable', () => {
    const { records, decrypt } = thread(['a', 'b', 'c']);
    const bodies = buildDisclosure('m1', records, decrypt).disclosedContext.map(c => c.body);
    expect(bodies).toEqual(['a', 'b', 'c']);
  });

  it('caps context at the documented maximum', () => {
    const { records, decrypt } = thread(Array.from({ length: 40 }, (_, i) => `msg ${i}`));
    const d = buildDisclosure('m20', records, decrypt);
    expect(d.disclosedContext.length).toBeLessThanOrEqual(MAX_CONTEXT_MESSAGES);
  });

  it('centres the window on the reported message', () => {
    const { records, decrypt } = thread(Array.from({ length: 40 }, (_, i) => `msg ${i}`));
    const bodies = buildDisclosure('m20', records, decrypt).disclosedContext.map(c => c.body);
    expect(bodies).toContain('msg 20');
    // Both sides represented: what led up to it and what followed.
    expect(bodies.some(b => b === 'msg 16')).toBe(true);
    expect(bodies.some(b => b === 'msg 24')).toBe(true);
  });

  it('handles a report on the first message without underflowing', () => {
    const { records, decrypt } = thread(['first', 'second', 'third']);
    const d = buildDisclosure('m0', records, decrypt);
    expect(d.disclosedContent).toBe('first');
    expect(d.disclosedContext[0].body).toBe('first');
  });

  it('carries sender attribution, so a moderator knows who said what', () => {
    const { records, decrypt } = thread(['a', 'b']);
    const d = buildDisclosure('m0', records, decrypt);
    expect(d.disclosedContext.map(c => c.sender_id)).toEqual(['sender', 'reader']);
  });

  it('truncates a very long body rather than sending it whole', () => {
    const { records, decrypt } = thread(['x'.repeat(MAX_DISCLOSED_CHARS + 500)]);
    const d = buildDisclosure('m0', records, decrypt);
    expect(d.disclosedContent.length).toBeLessThan(MAX_DISCLOSED_CHARS + 200);
    expect(d.disclosedContent).toMatch(/truncated/);
  });
});

describe('failure handling', () => {
  it('refuses to report a message that is not in the thread', () => {
    const { records, decrypt } = thread(['a']);
    expect(() => buildDisclosure('nope', records, decrypt)).toThrow(DisclosureError);
  });

  it('refuses when the reported message cannot be decrypted here', () => {
    const { records } = thread(['a']);
    const failing = () => { throw new Error('no key'); };
    expect(() => buildDisclosure('m0', records, failing)).toThrow(/cannot be read on this device/i);
  });

  it('marks unreadable context rather than silently dropping it', () => {
    // A gap in the transcript would mislead a moderator as much as a
    // missing message, so unreadable entries are labelled, not removed.
    const { records, decrypt } = thread(['a', 'target', 'c']);
    const partial = (r: EncryptedRecord) => {
      if (r.id === 'm2') throw new Error('unreadable');
      return decrypt(r);
    };
    const d = buildDisclosure('m1', records, partial);
    expect(d.disclosedContext).toHaveLength(3);
    expect(d.disclosedContext[2].body).toMatch(/could not be decrypted/i);
  });
});

describe('what the user is told', () => {
  it('states plainly how much leaves the device', () => {
    const { records, decrypt } = thread(['a', 'b', 'c']);
    const d = buildDisclosure('m1', records, decrypt);
    expect(describeDisclosure(d)).toBe(
      "The reported message and 2 surrounding messages will be sent to Echo's moderators.",
    );
  });

  it('handles a lone message', () => {
    const { records, decrypt } = thread(['only']);
    const d = buildDisclosure('m0', records, decrypt);
    expect(describeDisclosure(d)).toMatch(/^The reported message will be sent/);
  });
});
