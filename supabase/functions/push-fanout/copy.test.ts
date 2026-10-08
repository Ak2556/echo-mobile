import { describe, expect, it } from 'vitest';
import { dmPushBody, pushBody, pushTitle, type Pick } from './copy';

describe('dmPushBody', () => {
  it('shows the preview when the server has one', () => {
    expect(dmPushBody('see you at 6')).toBe('see you at 6');
  });
  it('caps it at 140 characters', () => {
    expect(dmPushBody('x'.repeat(300))).toHaveLength(140);
  });
  it('never sends a blank notification for a sealed message', () => {
    expect(dmPushBody(null)).toBe('Sent you a message');
    expect(dmPushBody(undefined)).toBe('Sent you a message');
    expect(dmPushBody('   ')).toBe('Sent you a message');
  });
});

// Every variant a type can produce, by handing the copy a picker that records
// the whole pool instead of choosing.
function variants(fn: (pick: Pick) => string): string[] {
  const seen: string[] = [];
  const pick: Pick = (arr) => { seen.push(...(arr as string[])); return arr[0]; };
  fn(pick);
  return seen;
}

const SOCIAL = ['like', 'comment', 'follow', 'follow_request', 'follow_accepted', 'repost', 'mention', 'friend_post', 'friend_answer', 'dm', 'bookmark', 'quote', 'personal_nudge'];

describe('push copy', () => {
  it('every title fits a lock screen and names the actor when it is about one', () => {
    for (const type of SOCIAL) {
      const titles = variants((p) => pushTitle(type, 'Ana', null, p));
      expect(titles.length, type).toBeGreaterThanOrEqual(3);
      for (const t of titles) {
        expect(t.length, t).toBeLessThanOrEqual(70);
        if (type !== 'personal_nudge') expect(t, t).toContain('Ana');
      }
    }
  });

  it('keeps an emoji reaction in the title it is reacting with', () => {
    const titles = variants((p) => pushTitle('reaction', 'Ana', 'mind_blown', p));
    expect(titles.length).toBeGreaterThanOrEqual(3);
    for (const t of titles) expect(t).toContain('🤯');
    expect(pushTitle('reaction', 'Ana', 'unknown')).toBe('Ana reacted to your echo');
  });

  it('claims nothing that one like, comment or follow cannot back up', () => {
    const lies = /(viral|everyone|everybody|going viral|doing numbers|famous)/i;
    for (const type of SOCIAL) {
      for (const t of variants((p) => pushTitle(type, 'Ana', null, p))) expect(t, t).not.toMatch(lies);
    }
  });

  it('shows the real text for content-carrying types', () => {
    for (const type of ['comment', 'mention', 'quote', 'friend_post']) {
      expect(pushBody(type, 'Ana', 'hello there')).toBe('hello there');
    }
  });

  it('keeps moderation, appeal and rules notifications plain', () => {
    expect(pushTitle('report_urgent', 'x')).toBe('Urgent report: act within 2 hours');
    expect(pushTitle('rules_reminder', 'x')).toBe("A reminder of Echo's rules");
    for (const type of ['report_resolved', 'content_removed', 'appeal_resolved']) {
      expect(pushTitle(type, 'x')).toBe('Echo');
      expect(pushBody(type, 'x', 'anything')).toBe('');
    }
  });
});
