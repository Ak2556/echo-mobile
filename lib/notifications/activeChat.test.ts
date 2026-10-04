import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearActiveConversation, isChatOpen, isDmFor, setActiveConversation } from './activeChat';

const dm = (target: string) => ({ kind: 'dm', target_id: target });

describe('isChatOpen', () => {
  beforeEach(() => setActiveConversation(null));

  it('is false when no thread is open', () => {
    expect(isChatOpen(dm('c1'))).toBe(false);
  });

  it('suppresses a DM for the open thread only', () => {
    setActiveConversation('c1');
    expect(isChatOpen(dm('c1'))).toBe(true);
    expect(isChatOpen(dm('c2'))).toBe(false);
  });

  it('never suppresses other kinds, even with a matching target', () => {
    setActiveConversation('c1');
    expect(isChatOpen({ kind: 'comment', target_id: 'c1' })).toBe(false);
    expect(isChatOpen({ kind: 'follow' })).toBe(false);
  });

  it('copes with a payload that has no data', () => {
    setActiveConversation('c1');
    expect(isChatOpen(null)).toBe(false);
    expect(isChatOpen(undefined)).toBe(false);
  });

  it('a stale cleanup does not clear the thread that replaced it', () => {
    setActiveConversation('c1');
    setActiveConversation('c2');
    clearActiveConversation('c1');
    expect(isChatOpen(dm('c2'))).toBe(true);
    clearActiveConversation('c2');
    expect(isChatOpen(dm('c2'))).toBe(false);
  });
});

describe('wiring', () => {
  it('the foreground handler consults isChatOpen, and the thread screen registers itself', () => {
    expect(readFileSync('lib/notifications/push.ts', 'utf8')).toMatch(/isChatOpen\(notification\.request\.content\.data\)/);
    const screen = readFileSync('app/messages/[id].tsx', 'utf8');
    expect(screen).toMatch(/setActiveConversation\(id\)/);
    expect(screen).toMatch(/clearActiveConversation\(id\)/);
    expect(screen).toMatch(/clearConversationNotifications\(id\)/);
    expect(screen).toMatch(/dismissConversationNotifications\(id\)/);
  });
});

describe('isDmFor', () => {
  it('matches a DM for exactly that conversation', () => {
    expect(isDmFor(dm('c1'), 'c1')).toBe(true);
    expect(isDmFor(dm('c1'), 'c2')).toBe(false);
    expect(isDmFor({ kind: 'comment', target_id: 'c1' }, 'c1')).toBe(false);
    expect(isDmFor(null, 'c1')).toBe(false);
  });
});
