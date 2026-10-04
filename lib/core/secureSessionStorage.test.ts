import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Supabase session used to sit in AsyncStorage as plaintext JSON: readable
 * with a file dump on a rooted or jailbroken device, and enough to impersonate
 * the account until the refresh token rotates.
 *
 * The session itself cannot simply move into SecureStore — the iOS Keychain
 * caps an entry at 2 KB and a session with provider tokens and metadata runs
 * past that. So the small thing goes in the Keychain (a 256-bit key) and the
 * big thing stays in AsyncStorage, encrypted with it.
 */

const secureStore: Record<string, string> = {};
const asyncStore: Record<string, string> = {};
let secureStoreAvailable = true;

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: vi.fn(async (k: string) => {
    if (!secureStoreAvailable) throw new Error('Keychain access failed');
    return secureStore[k] ?? null;
  }),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    if (!secureStoreAvailable) throw new Error('Keychain access failed');
    secureStore[k] = v;
  }),
  deleteItemAsync: vi.fn(async (k: string) => { delete secureStore[k]; }),
}));

// Distinct bytes per call, so IVs differ between writes and a regenerated key
// differs from the one it replaced — a fixed sequence would hide both.
const rnd = vi.hoisted(() => ({ calls: 0 }));
vi.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    rnd.calls += 1;
    return Uint8Array.from({ length: n }, (_, i) => (i * 37 + rnd.calls * 101 + 11) % 256);
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => asyncStore[k] ?? null),
    setItem: vi.fn(async (k: string, v: string) => { asyncStore[k] = v; }),
    removeItem: vi.fn(async (k: string) => { delete asyncStore[k]; }),
  },
}));

vi.mock('./monitoring', () => ({ captureException: vi.fn() }));

// The module caches the AES key after first read, so the Keychain is not hit
// on every session load. That cache has to be dropped between tests, or a test
// that clears the fake Keychain would still see the previous key.
type Storage = typeof import('./secureSessionStorage').secureSessionStorage;
let secureSessionStorage: Storage;
let ENVELOPE_PREFIX: string;

const KEY = 'sb-eyokhisijabitzjiydmz-auth-token';
const SESSION = JSON.stringify({
  access_token: 'eyJhbGciOiJIUzI1NiJ9.super-secret-access-token',
  refresh_token: 'rotating-refresh-token',
  user: { id: '4b5c4379-a665-4c9d-bf62-17eee8e02384' },
});

beforeEach(async () => {
  for (const k of Object.keys(secureStore)) delete secureStore[k];
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  secureStoreAvailable = true;

  vi.resetModules();
  const mod = await import('./secureSessionStorage');
  secureSessionStorage = mod.secureSessionStorage;
  ENVELOPE_PREFIX = mod.ENVELOPE_PREFIX;
});

describe('secureSessionStorage', () => {
  it('round-trips a session', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('leaves nothing readable on disk', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    const onDisk = asyncStore[KEY];
    expect(onDisk).toBeTruthy();
    expect(onDisk.startsWith(ENVELOPE_PREFIX)).toBe(true);
    expect(onDisk).not.toContain('super-secret-access-token');
    expect(onDisk).not.toContain('rotating-refresh-token');
    expect(onDisk).not.toContain('4b5c4379');
  });

  it('keeps the key out of AsyncStorage and in the keychain', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    expect(Object.keys(secureStore)).toHaveLength(1);
    expect(JSON.stringify(asyncStore)).not.toContain(Object.values(secureStore)[0]);
  });

  it('reads a session written before this shipped, and upgrades it in place', async () => {
    // Existing installs have plaintext JSON here. Rejecting it would sign out
    // every user on upgrade.
    asyncStore[KEY] = SESSION;

    await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
    expect(asyncStore[KEY].startsWith(ENVELOPE_PREFIX)).toBe(true);
    await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('returns null rather than throwing when the payload is tampered with', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    asyncStore[KEY] = asyncStore[KEY].slice(0, -4) + 'dead';

    // Null means "no session" — the user signs in again. A throw here would
    // surface as a crash on launch.
    await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
  });

  it('returns null when the key is gone', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);

    // A restored backup or a cleared Keychain, seen on the next launch: the
    // envelope survives, the key does not. Re-import to get a cold process,
    // since the running one still holds the key in memory.
    for (const k of Object.keys(secureStore)) delete secureStore[k];
    vi.resetModules();
    const relaunched = (await import('./secureSessionStorage')).secureSessionStorage;

    await expect(relaunched.getItem(KEY)).resolves.toBeNull();
  });

  it('refuses to persist the session when the keychain is unavailable', async () => {
    // This used to fall back to writing the session as plaintext, so that an
    // iOS simulator without a signing entitlement — which throws on every
    // keychain call — stayed usable. That traded the one thing this module
    // exists to prevent for developer convenience, and did it silently.
    //
    // Now it declines. The session is still live in memory, so the user stays
    // signed in for this launch; they re-authenticate on the next one. The
    // cost is re-signing in on such a simulator every launch.
    secureStoreAvailable = false;

    await secureSessionStorage.setItem(KEY, SESSION);

    expect(asyncStore[KEY], 'the session must never reach disk unencrypted').toBeUndefined();
    await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
  });

  it('clears any earlier envelope rather than leaving a stale session behind', async () => {
    // Persist normally, then lose the keychain. Declining to write is not
    // enough on its own: the previous envelope would still be there, and the
    // next launch would restore an older session than the one the user just
    // established.
    await secureSessionStorage.setItem(KEY, SESSION);
    expect(asyncStore[KEY]).toBeDefined();

    // A cold process is required: the running one still holds the key in
    // memory, so it would happily encrypt and never reach the refusal path.
    for (const k of Object.keys(secureStore)) delete secureStore[k];
    secureStoreAvailable = false;
    vi.resetModules();
    const relaunched = (await import('./secureSessionStorage')).secureSessionStorage;

    await relaunched.setItem(KEY, '{"access_token":"newer"}');

    expect(asyncStore[KEY]).toBeUndefined();
  });

  it('removes both halves on sign-out', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.removeItem(KEY);

    await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
    expect(asyncStore[KEY]).toBeUndefined();
  });
});
