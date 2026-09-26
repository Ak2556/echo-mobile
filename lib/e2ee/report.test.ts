import { beforeEach, describe, expect, it } from 'vitest';
import { clearMessageCache, rememberMessage } from './cache';
import { buildDisclosure, DISCLOSURE_CONTEXT_LIMIT } from './report';

const key = new Uint8Array(32).fill(7);
const put = (id: string, conversationId: string, minute: number, text = `msg ${id}`) =>
  rememberMessage({ id, text, conversationId, senderId: 'u-x', createdAt: `2026-09-26T10:${String(minute).padStart(2, '0')}:00Z`, nonce: 'n'.repeat(48), messageKey: key });

beforeEach(() => clearMessageCache());

describe('buildDisclosure', () => {
  it('returns null for a message this device never opened (plaintext messages need no disclosure)', () => {
    expect(buildDisclosure('nope')).toBeNull();
  });

  it('discloses the message, its key, and at most five earlier messages from the same chat', () => {
    for (let i = 0; i < 9; i++) put(`m${i}`, 'c-1', i);
    put('other', 'c-2', 3);
    put('later', 'c-1', 30);
    const d = buildDisclosure('m8')!;
    expect(d.content).toBe('msg m8');
    expect(d.messageKey).toBe('07'.repeat(32));
    expect(d.context).toHaveLength(DISCLOSURE_CONTEXT_LIMIT);
    expect(d.context.map(c => c.text)).toEqual(['msg m3', 'msg m4', 'msg m5', 'msg m6', 'msg m7']);
  });
});
