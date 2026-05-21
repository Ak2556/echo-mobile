import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRankedFeed, fetchRemoteProfile, recordRemoteEchoView, setRemoteRepost } from './supabaseEchoApi';

const mocks = vi.hoisted(() => {
  const insertMock = vi.fn(() => ({ error: null as unknown }));
  const deleteChainMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ error: null as unknown })),
    })),
  }));
  const fromMock = vi.fn() as ReturnType<typeof vi.fn>;
  fromMock.mockReturnValue({
    insert: insertMock,
    delete: deleteChainMock,
  });
  const rpcMock = vi.fn();
  const getSessionMock = vi.fn(() =>
    Promise.resolve({ data: { session: { user: { id: 'test-user' } } }, error: null })
  );
  return { insertMock, deleteChainMock, fromMock, rpcMock, getSessionMock };
});

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSessionMock,
    },
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
  },
}));

vi.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  readAsStringAsync: vi.fn(),
  uploadAsync: vi.fn(),
}));

describe('setRemoteRepost', () => {
  beforeEach(() => {
    mocks.insertMock.mockReset();
    mocks.insertMock.mockReturnValue({ error: null });
    mocks.deleteChainMock.mockClear();
    mocks.fromMock.mockReset();
    mocks.fromMock.mockReturnValue({
      insert: mocks.insertMock,
      delete: mocks.deleteChainMock,
    });
    mocks.getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });
  });

  it('inserts echo_reposts when repost is true', async () => {
    await setRemoteRepost('echo-1', true);
    expect(mocks.insertMock).toHaveBeenCalledWith({ echo_id: 'echo-1', user_id: 'test-user' });
  });

  it('calls delete when repost is false', async () => {
    await setRemoteRepost('echo-1', false);
    expect(mocks.deleteChainMock).toHaveBeenCalled();
  });
});

describe('recordRemoteEchoView', () => {
  beforeEach(() => {
    mocks.insertMock.mockReset();
    mocks.insertMock.mockReturnValue({ error: null });
    mocks.fromMock.mockReset();
    mocks.fromMock.mockReturnValue({
      insert: mocks.insertMock,
      delete: mocks.deleteChainMock,
    });
    mocks.getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });
  });

  it('inserts echo_views when session exists', async () => {
    await recordRemoteEchoView('echo-9');
    expect(mocks.insertMock).toHaveBeenCalledWith({ echo_id: 'echo-9', user_id: 'test-user' });
  });

  it('swallows unique violations', async () => {
    mocks.insertMock.mockReturnValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    await expect(recordRemoteEchoView('echo-9')).resolves.toBeUndefined();
  });
});

describe('fetchRemoteProfile', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset();
  });

  it('looks up non-UUID profile routes by username', async () => {
    const eqMock = vi.fn(() => ({
      maybeSingle: vi.fn(() => ({ data: { id: 'user-uuid', username: 'alice' }, error: null })),
    }));
    mocks.fromMock.mockReturnValue({
      select: vi.fn(() => ({ eq: eqMock })),
    });

    const profile = await fetchRemoteProfile('Alice');

    expect(profile?.id).toBe('user-uuid');
    expect(eqMock).toHaveBeenCalledWith('username', 'alice');
    expect(eqMock).not.toHaveBeenCalledWith('id', 'Alice');
  });
});

describe('fetchRankedFeed', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset();
    mocks.fromMock.mockReset();
    mocks.getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'test-user' } } }, error: null });
  });

  it('hydrates reaction counters and viewer reactions for ranked RPC rows', async () => {
    mocks.rpcMock.mockResolvedValue({
      data: [{
        id: 'echo-1',
        author_id: 'author-1',
        title: 'Title',
        prompt: 'Prompt',
        response: 'Response',
        likes_count: 0,
        comment_count: 0,
        repost_count: 0,
        view_count: 0,
        created_at: '2026-05-21T00:00:00.000Z',
        media_urls: null,
        quoted_echo_id: null,
        username: 'alice',
        display_name: 'Alice',
        bio: '',
        avatar_color: '#111111',
        avatar_url: null,
        is_verified: false,
        follower_count: 0,
        rank_score: 42,
      }],
      error: null,
    });
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'public_echoes') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              data: [{
                id: 'echo-1',
                mind_blown_count: 2,
                taking_notes_count: 0,
                agree_count: 1,
                disagree_count: 0,
              }],
              error: null,
            })),
          })),
        };
      }
      if (table === 'echo_reactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({ data: [{ echo_id: 'echo-1', reaction: 'agree' }], error: null })),
            })),
          })),
        };
      }
      if (table === 'echo_reposts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({ data: [], error: null })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ data: [], error: null })),
        })),
      };
    });

    const feed = await fetchRankedFeed();

    expect(feed[0].reactionCounts).toEqual({
      mind_blown: 2,
      taking_notes: 0,
      agree: 1,
      disagree: 0,
    });
    expect(feed[0].userReactions).toEqual(['agree']);
  });
});
