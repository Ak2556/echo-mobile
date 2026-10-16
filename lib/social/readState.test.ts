import { describe, expect, it } from 'vitest';
import { isReadForViewer } from './readState';

const me = 'me';
const msg = (over: Partial<{ senderId: string; createdAt: string; readAt: string | null }> = {}) =>
  ({ senderId: 'them', createdAt: '2026-10-16T10:00:00Z', readAt: null, ...over });

describe('isReadForViewer', () => {
  it('a message with a receipt is read', () => {
    expect(isReadForViewer(msg({ readAt: '2026-10-16T10:05:00Z' }), me, null)).toBe(true);
  });
  it('their message older than my private marker is read, even with no receipt', () => {
    expect(isReadForViewer(msg(), me, '2026-10-16T10:30:00Z')).toBe(true);
    expect(isReadForViewer(msg({ createdAt: '2026-10-16T10:30:00Z' }), me, '2026-10-16T10:30:00Z')).toBe(true);
  });
  it('their message newer than my marker is unread', () => {
    expect(isReadForViewer(msg({ createdAt: '2026-10-16T11:00:00Z' }), me, '2026-10-16T10:30:00Z')).toBe(false);
  });
  it('with no marker (the server function is missing, or a brand new chat) only a receipt counts', () => {
    expect(isReadForViewer(msg(), me, null)).toBe(false);
    expect(isReadForViewer(msg(), me, undefined)).toBe(false);
  });
  it('my own messages are read only when the partner has a receipt, whatever my marker says', () => {
    expect(isReadForViewer(msg({ senderId: me }), me, '2026-10-17T00:00:00Z')).toBe(false);
    expect(isReadForViewer(msg({ senderId: me, readAt: '2026-10-16T10:05:00Z' }), me, null)).toBe(true);
  });
});
