import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A comment written offline is replayed by the outbox when the connection returns. If the text filter
 * refuses it then, the outbox must mark the op failed for good (never retry a refusal) and must NOT
 * report it to Sentry: a refusal is the filter doing its job, and reporting each one would bury the
 * failures that matter.
 */
const m = vi.hoisted(() => {
  type Op = { id: string; type: string; payload: unknown; status: string; attempts: number; createdAt: number; nextAttemptAt?: number; lastError?: string };
  const ops: Op[] = [];
  return {
    ops,
    insertRemoteComment: vi.fn(),
    captureException: vi.fn(),
    fakeOutbox: {
      pending: () => ops.filter((o) => o.status === 'pending'),
      all: () => ops,
      update: (id: string, patch: Partial<Op>) => { const o = ops.find((x) => x.id === id); if (o) Object.assign(o, patch); },
      remove: (id: string) => { const i = ops.findIndex((x) => x.id === id); if (i >= 0) ops.splice(i, 1); },
    },
  };
});

// mutationErrors (the real permanent-vs-transient logic) imports a UI component and the e2ee crypto
// module, which drag in the Supabase client. Stub just those two; the classification itself is real.
vi.mock('../components/common/ErrorState', () => ({ classifyError: () => 'unknown' }));
vi.mock('../lib/e2ee/crypto', () => ({ isRecipientNotReady: () => false }));
vi.mock('../store/outbox', () => ({ outbox: m.fakeOutbox }));
vi.mock('../lib/core/net', () => ({ isAppOnline: () => true, initOnlineManager: vi.fn() }));
vi.mock('../lib/core/monitoring', () => ({ captureException: m.captureException }));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { subscribe: vi.fn(), isOnline: () => true } }));
vi.mock('../lib/supabaseEchoApi', () => ({
  setRemoteLike: vi.fn(), setRemoteBookmark: vi.fn(), setRemoteRepost: vi.fn(), setRemoteFollow: vi.fn(),
  insertRemoteEcho: vi.fn(), uploadEchoImages: vi.fn(), uploadEchoVideo: vi.fn(),
  insertRemoteComment: m.insertRemoteComment,
  setRemoteCommentLike: vi.fn(), setRemoteEchoReaction: vi.fn(), submitDailyAnswer: vi.fn(),
}));

import { drainOutbox } from '../lib/core/outboxProcessor';

const commentOp = () => ({
  id: 'op1', type: 'comment', attempts: 0, status: 'pending', createdAt: Date.now(),
  payload: { echoId: 'e1', content: 'text', parentId: undefined, clientId: 'c1' },
});

beforeEach(() => {
  m.ops.length = 0;
  m.insertRemoteComment.mockReset();
  m.captureException.mockReset();
});

describe('outbox and the text filter', () => {
  it('marks a refused comment failed, keeps it for the person to see, and does not report it', async () => {
    m.ops.push(commentOp());
    m.insertRemoteComment.mockRejectedValue({ code: 'EC001', message: 'text_filter:comment' });
    await drainOutbox();
    expect(m.ops[0].status).toBe('failed');
    expect(m.insertRemoteComment).toHaveBeenCalledTimes(1);
    expect(m.captureException).not.toHaveBeenCalled();
  });

  it('does not retry a refusal on the next drain', async () => {
    m.ops.push(commentOp());
    m.insertRemoteComment.mockRejectedValue({ code: 'EC001', message: 'text_filter:comment' });
    await drainOutbox();
    await drainOutbox();
    expect(m.insertRemoteComment).toHaveBeenCalledTimes(1);
  });

  it('still reports a permanent failure that is NOT the filter', async () => {
    m.ops.push(commentOp());
    m.insertRemoteComment.mockRejectedValue({ code: '42501', message: 'permission denied' });
    await drainOutbox();
    expect(m.ops[0].status).toBe('failed');
    expect(m.captureException).toHaveBeenCalledTimes(1);
  });

  it('removes a comment that was accepted', async () => {
    m.ops.push(commentOp());
    m.insertRemoteComment.mockResolvedValue(undefined);
    await drainOutbox();
    expect(m.ops).toHaveLength(0);
  });
});
