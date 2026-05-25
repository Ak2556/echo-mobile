import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Test B (supabase) — the supabase client itself is a thin createClient
 * wrapper, so the meaningful contract is "boots with placeholder values
 * when the env is missing so the app can still launch in offline mode".
 * We assert that behaviour by re-evaluating the module under two env
 * configurations and inspecting what createClient was called with.
 */

type CreateClientArgs = [string, string, Record<string, unknown>?];

const createClientMock = vi.fn(
  (..._args: CreateClientArgs) => ({
    auth: {
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
    },
  }),
);

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: 'ios' },
}));

describe('supabase client bootstrapping', () => {
  const ORIGINAL_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const ORIGINAL_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    createClientMock.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
  });

  it('falls back to placeholder values when env vars are unset (offline mode)', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    await import('./supabase');
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key] = createClientMock.mock.calls[0];
    expect(url).toBe('https://placeholder.supabase.co');
    expect(key).toBe('placeholder-key');
  });

  it('uses the configured EXPO_PUBLIC_SUPABASE_URL when present', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'real-key';
    await import('./supabase');
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key] = createClientMock.mock.calls[0];
    expect(url).toBe('https://example.supabase.co');
    expect(key).toBe('real-key');
  });

  it('initialises auth with persistSession + autoRefreshToken', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'real-key';
    await import('./supabase');
    const opts = createClientMock.mock.calls[0][2] as { auth: Record<string, unknown> } | undefined;
    expect(opts?.auth.autoRefreshToken).toBe(true);
    expect(opts?.auth.persistSession).toBe(true);
  });
});
