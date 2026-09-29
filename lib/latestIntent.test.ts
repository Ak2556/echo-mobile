import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLatestIntent } from './latestIntent';

/** Lets the in-flight turn start, as a real second tap would arrive on a later event-loop turn. */
const tick = () => new Promise(r => setTimeout(r, 0));

/** A server whose writes the test completes by hand, one at a time. */
function server() {
  const sent: boolean[] = [];
  const open: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  let state: boolean | undefined;
  const write = (v: boolean) => new Promise<void>((res, rej) => {
    sent.push(v);
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    open.push({
      resolve: () => { concurrent -= 1; state = v; res(); },
      reject: e => { concurrent -= 1; rej(e); },
    });
  });
  return {
    write, sent,
    state: () => state,
    maxConcurrent: () => maxConcurrent,
    async ok() { await tick(); open.shift()!.resolve(); await tick(); },
    async fail(e: unknown) { await tick(); open.shift()!.reject(e); await tick(); },
  };
}

describe('the race this fixes', () => {
  it('like → unlike ends unliked on the server, and never sends both at once', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const a = intent.send('echo-1', true, s.write);
    await tick();                          // the like is on the wire
    const b = intent.send('echo-1', false, s.write);
    await s.ok(); // the like lands
    await s.ok(); // then the unlike
    await Promise.all([a, b]);
    expect(s.sent).toEqual([true, false]);
    expect(s.state()).toBe(false);
    expect(s.maxConcurrent()).toBe(1);
  });

  it('like → unlike → like sends only what is needed and ends liked', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const first = intent.send('echo-1', true, s.write);
    await tick();                          // the like is on the wire
    const taps = [first, intent.send('echo-1', false, s.write), intent.send('echo-1', true, s.write)];
    await s.ok();
    await Promise.all(taps);
    // Turns 2 and 3 found the server already at the latest value (true).
    expect(s.sent).toEqual([true]);
    expect(s.state()).toBe(true);
  });

  it('a failed older tap does not stop the newer one, and does not reject it', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const a = intent.send('echo-1', true, s.write);
    const aResult = a.then(() => 'ok', (e: Error) => e.message);
    await tick();
    const b = intent.send('echo-1', false, s.write);
    await s.fail(new Error('500'));
    expect(await aResult).toBe('500');
    await s.ok();
    await expect(b).resolves.toBeUndefined();
    expect(s.state()).toBe(false);
  });

  it('a retry re-reads the latest tap instead of re-sending its own value', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const retry = { retries: 2, baseMs: 1, shouldRetry: () => true };
    const a = intent.send('echo-1', true, s.write, retry);
    await s.fail(new Error('timed out'));   // transient: the turn will retry
    const b = intent.send('echo-1', false, s.write, retry); // user unlikes during backoff
    await new Promise(r => setTimeout(r, 10));
    await s.ok();
    await Promise.all([a, b]);
    expect(s.sent).toEqual([true, false]);  // the retry sent the NEW value
    expect(s.state()).toBe(false);
  });
});

describe('taps in the same tick', () => {
  it('collapse into one request carrying the last value', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const a = intent.send('echo-1', true, s.write);
    const b = intent.send('echo-1', false, s.write);
    await s.ok();
    await Promise.all([a, b]);
    expect(s.sent).toEqual([false]);
  });
});

describe('who may revert and refetch', () => {
  it('while a newer tap is in flight the key is not idle', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const a = intent.send('echo-1', true, s.write);
    await tick();
    const b = intent.send('echo-1', false, s.write);
    expect(intent.isIdle('echo-1')).toBe(false);
    expect(intent.isLatest('echo-1', true)).toBe(false);
    expect(intent.isLatest('echo-1', false)).toBe(true);
    await s.ok(); await s.ok();
    await Promise.all([a, b]);
    expect(intent.isIdle('echo-1')).toBe(true);
  });

  it('keys are independent', async () => {
    const s = server();
    const intent = createLatestIntent<boolean>();
    const a = intent.send('echo-1', true, s.write);
    const b = intent.send('echo-2', true, s.write);
    await tick();
    expect(s.maxConcurrent()).toBe(2); // different posts do not queue behind each other
    await s.ok(); await s.ok();
    await Promise.all([a, b]);
  });

  it('forgets the key once idle, so a later tap is always sent', async () => {
    // Keeping "applied = true" would skip this tap even though the post may
    // have been unliked on another device since.
    const s = server();
    const intent = createLatestIntent<boolean>();
    const a = intent.send('echo-1', true, s.write);
    await s.ok(); await a;
    const b = intent.send('echo-1', true, s.write);
    await s.ok(); await b;
    expect(s.sent).toEqual([true, true]);
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('the toggles go through latest-intent and no longer use a TanStack retry', () => {
    const social = read('src/features/feed/api/useSupabaseSocial.ts');
    for (const [intent, call] of [
      ['likeIntent', 'setRemoteLike'],
      ['bookmarkIntent', 'setRemoteBookmark'],
      ['repostIntent', 'setRemoteRepost'],
      ['followIntent', 'setRemoteFollow'],
    ]) {
      expect(social).toMatch(new RegExp(`${intent}\\.send\\(\\w+, \\w+, v => ${call}\\(\\w+, v\\), TOGGLE_RETRY\\)`));
      expect(social).toMatch(new RegExp(`if \\(${intent}\\.isIdle\\(\\w+\\)\\) patch`));
    }
    expect(social).not.toMatch(/retry: idempotentRetry/);

    const comments = read('hooks/queries/useEchoComments.ts');
    expect(comments).toMatch(/commentLikeIntent\.send\(commentId, like, v => setRemoteCommentLike\(commentId, v\)/);
    expect(comments).not.toMatch(/ctx\.previous/);
  });
});
