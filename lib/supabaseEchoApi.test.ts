import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setRemoteRepost, recordRemoteEchoView } from './supabaseEchoApi';

const insertMock = vi.fn(() => ({ error: null as unknown }));
const deleteChainMock = vi.fn(() => ({
  eq: vi.fn(() => ({
    eq: vi.fn(() => ({ error: null as unknown })),
  })),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { user: { id: 'test-user' } } }, error: null })
      ),
    },
    from: vi.fn(() => ({
      insert: insertMock,
      delete: deleteChainMock,
    })),
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
    insertMock.mockReset();
    insertMock.mockReturnValue({ error: null });
    deleteChainMock.mockClear();
  });

  it('inserts echo_reposts when repost is true', async () => {
    await setRemoteRepost('echo-1', true);
    expect(insertMock).toHaveBeenCalledWith({ echo_id: 'echo-1', user_id: 'test-user' });
  });

  it('calls delete when repost is false', async () => {
    await setRemoteRepost('echo-1', false);
    expect(deleteChainMock).toHaveBeenCalled();
  });
});

describe('recordRemoteEchoView', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockReturnValue({ error: null });
  });

  it('inserts echo_views when session exists', async () => {
    await recordRemoteEchoView('echo-9');
    expect(insertMock).toHaveBeenCalledWith({ echo_id: 'echo-9', user_id: 'test-user' });
  });

  it('swallows unique violations', async () => {
    insertMock.mockReturnValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    await expect(recordRemoteEchoView('echo-9')).resolves.toBeUndefined();
  });
});
