/**
 * What must not survive a sign-out, and what a sign-out must not reach.
 *
 * - The offline outbox is not keyed by user. Without a clear at sign-out, the
 *   next drain replays the previous account's posts, comments and follows
 *   under whoever signs in next.
 * - supabase-js signs out with scope 'global' by default, which revokes the
 *   user's sessions on every device. A forced sign-out after one device's
 *   refresh fails must not do that.
 * - voice-command used to put GEMINI_API_KEY in the request URL and return
 *   String(e) to the caller. Deno's fetch errors quote the URL, so a network
 *   failure handed the key to the client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const calls: string[] = [];
/** Runs after each recorded write — lets a test sign out mid-drain. */
let afterCall: (() => void) | null = null;

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', Version: '26', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));
vi.mock('./mutationErrors', () => ({ isDuplicateError: () => false, isTransientError: () => false }));
vi.mock('./net', () => ({ isAppOnline: () => true, initOnlineManager: () => {} }));
vi.mock('./monitoring', () => ({ captureException: () => {} }));
vi.mock('./supabaseEchoApi', () => {
  const record = (name: string) => async (...args: unknown[]) => {
    calls.push(`${name}:${String(args[0])}`);
    afterCall?.();
  };
  return {
    setRemoteLike: record('like'),
    setRemoteBookmark: record('bookmark'),
    setRemoteRepost: record('repost'),
    setRemoteFollow: record('follow'),
    insertRemoteEcho: record('publish'),
    uploadEchoImages: async (u: string[]) => u,
    uploadEchoVideo: async (u: string) => u,
    insertRemoteComment: record('comment'),
    setRemoteCommentLike: record('commentLike'),
    setRemoteEchoReaction: record('echoReaction'),
    submitDailyAnswer: record('dailyAnswer'),
  };
});

const root = resolve(__dirname, '..');

describe('outbox at sign-out', () => {
  beforeEach(async () => {
    calls.length = 0;
    const { useOutbox } = await import('../store/outbox');
    useOutbox.getState().clearAll();
  });

  it('clearAll drops every queued op, pending or failed', async () => {
    const { outbox } = await import('../store/outbox');
    outbox.enqueue('like', { echoId: 'a', like: true });
    const failed = outbox.enqueue('follow', { userId: 'b', follow: true });
    outbox.update(failed.id, { status: 'failed' });

    outbox.clearAll();

    expect(outbox.all()).toEqual([]);
  });

  it('a drain already running stops sending once the queue is cleared', async () => {
    const { outbox } = await import('../store/outbox');
    const { drainOutbox } = await import('./outboxProcessor');
    outbox.enqueue('like', { echoId: 'first', like: true });
    outbox.enqueue('follow', { userId: 'second', follow: true });

    // The sign-out lands while the first write is in flight.
    afterCall = () => outbox.clearAll();
    try {
      await drainOutbox();
    } finally {
      afterCall = null;
    }

    expect(calls).toEqual(['like:first']);
  });

  it('the auth listener clears the outbox on SIGNED_OUT', () => {
    const src = readFileSync(resolve(root, 'lib/auth/listener.ts'), 'utf8');
    const signedOut = src.slice(src.indexOf("event === 'SIGNED_OUT'"));
    expect(signedOut).toMatch(/outbox\.clearAll\(\)/);
  });
});

describe('sign-out scope', () => {
  // Deleting the account ends every session by definition; nothing else may.
  const GLOBAL_ALLOWED = new Set(['app/delete-account.tsx']);

  function sources(dir: string): string[] {
    return readdirSync(resolve(root, dir), { withFileTypes: true, recursive: true })
      .filter(e => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
      .map(e => resolve(e.parentPath, e.name).slice(root.length + 1));
  }

  it('every sign-out outside account deletion is local', () => {
    const offenders: string[] = [];
    for (const file of [...sources('lib'), ...sources('app'), ...sources('src')]) {
      if (GLOBAL_ALLOWED.has(file)) continue;
      const src = readFileSync(resolve(root, file), 'utf8');
      for (const m of src.matchAll(/auth\.signOut\(([^)]*)\)/g)) {
        if (!/scope:\s*'local'/.test(m[1])) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('edge functions keep provider keys out of URLs and responses', () => {
  const fnDir = resolve(root, 'supabase/functions');
  const files = readdirSync(fnDir, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map(e => resolve(e.parentPath, e.name));

  it('no function puts an API key in a query string', () => {
    const offenders = files.filter(f => /[?&]key=\$\{/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => f.slice(root.length + 1))).toEqual([]);
  });

  it('voice-command returns no raw error detail to the client', () => {
    const file = resolve(fnDir, 'voice-command/index.ts');
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/json\(\{[^}]*detail/);
    expect(src).toMatch(/"x-goog-api-key": GEMINI_API_KEY/);
  });
});
