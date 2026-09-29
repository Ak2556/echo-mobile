import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; user_id: string; public_key: string; label: string | null; revoked_at: string | null; last_seen_at?: string };
const table: Row[] = [];
const calls: unknown[] = [];
let failSelect = false;

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('../supabase', () => {
  const from = (name: string) => {
    if (name !== 'user_devices') throw new Error(`unexpected table ${name}`);
    return {
      insert(row: Omit<Row, 'revoked_at'>) {
        calls.push({ op: 'insert', row });
        table.push({ revoked_at: null, ...row });
        return Promise.resolve({ error: null });
      },
      update(patch: Partial<Row>) {
        calls.push({ op: 'update', patch });
        return {
          eq(_col: string, id: string) {
            const row = table.find(r => r.id === id);
            if (row) Object.assign(row, patch);
            return Promise.resolve({ error: null });
          },
        };
      },
      select(_cols: string) {
        return {
          eq(_col: string, id: string) {
            return {
              maybeSingle: () =>
                failSelect
                  ? Promise.resolve({ data: null, error: { message: 'network down' } })
                  : Promise.resolve({ data: table.find(r => r.id === id) ?? null, error: null }),
            };
          },
          in(_col: string, userIds: string[]) {
            return {
              is: (_c: string, _v: null) =>
                Promise.resolve({ data: table.filter(r => userIds.includes(r.user_id) && r.revoked_at === null), error: null }),
            };
          },
        };
      },
    };
  };
  return { supabase: { from } };
});

import * as SecureStore from 'expo-secure-store';
import { ensureDeviceRegistered, fetchTargetDevices, getLocalDevice, forgetLocalDevice } from './deviceKeys';

beforeEach(async () => {
  table.length = 0;
  calls.length = 0;
  failSelect = false;
  await SecureStore.deleteItemAsync('echo.e2ee.device.u-1');
});

describe('ensureDeviceRegistered', () => {
  it('generates, stores and publishes a device on first run', async () => {
    const d = await ensureDeviceRegistered('u-1');
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ id: d.deviceId, user_id: 'u-1', public_key: d.keyPair.publicKey, label: 'ios' });
    expect(await getLocalDevice('u-1')).toEqual(d);
  });

  it('is idempotent across restarts: the second run publishes nothing', async () => {
    const first = await ensureDeviceRegistered('u-1');
    const second = await ensureDeviceRegistered('u-1');
    expect(second).toEqual(first);
    expect(calls.filter(c => (c as { op: string }).op === 'insert')).toHaveLength(1);
  });

  it('concurrent calls share one registration', async () => {
    const [a, b] = await Promise.all([ensureDeviceRegistered('u-1'), ensureDeviceRegistered('u-1')]);
    expect(a).toEqual(b);
    expect(table).toHaveLength(1);
  });

  it('replaces a device whose row was revoked', async () => {
    const first = await ensureDeviceRegistered('u-1');
    table[0].revoked_at = new Date().toISOString();
    const second = await ensureDeviceRegistered('u-1');
    expect(second.deviceId).not.toBe(first.deviceId);
    expect(second.keyPair.publicKey).not.toBe(first.keyPair.publicKey);
  });

  it('does not throw away its key on a network error', async () => {
    const first = await ensureDeviceRegistered('u-1');
    failSelect = true;
    await expect(ensureDeviceRegistered('u-1')).rejects.toBeTruthy();
    failSelect = false;
    expect(await getLocalDevice('u-1')).toEqual(first);
  });

  it('never sends the private key anywhere', async () => {
    const d = await ensureDeviceRegistered('u-1');
    expect(JSON.stringify(calls)).not.toContain(d.keyPair.privateKey);
  });

  it('keeps each account on this device separate', async () => {
    const one = await ensureDeviceRegistered('u-1');
    const two = await ensureDeviceRegistered('u-2');
    expect(two.deviceId).not.toBe(one.deviceId);
    await SecureStore.deleteItemAsync('echo.e2ee.device.u-2');
  });
});

describe('signing out and back in', () => {
  it('reuses the same device, so messages sealed to it stay readable', async () => {
    // Sign-out touches neither the keychain nor user_devices; the next
    // sign-in runs registration again.
    const before = await ensureDeviceRegistered('u-1');
    const after = await ensureDeviceRegistered('u-1');
    expect(after.deviceId).toBe(before.deviceId);
    expect(after.keyPair.privateKey).toBe(before.keyPair.privateKey);
    expect(table.filter(r => r.user_id === 'u-1')).toHaveLength(1);
  });
});

describe('forgetLocalDevice', () => {
  it('removes the private key without writing to the server', async () => {
    const d = await ensureDeviceRegistered('u-1');
    const rowBefore = { ...table.find(r => r.id === d.deviceId) };
    await forgetLocalDevice('u-1');
    expect(await getLocalDevice('u-1')).toBeNull();
    // The row is removed by the account's cascade, not by this call.
    expect(table.find(r => r.id === d.deviceId)).toEqual(rowBefore);
  });
});

describe('fetchTargetDevices', () => {
  it('returns only active devices', async () => {
    table.push(
      { id: 'd-live', user_id: 'u-9', public_key: 'a'.repeat(64), label: 'ios', revoked_at: null },
      { id: 'd-dead', user_id: 'u-9', public_key: 'b'.repeat(64), label: 'ios', revoked_at: '2026-09-01T00:00:00Z' },
    );
    expect(await fetchTargetDevices(['u-9'])).toEqual([{ userId: 'u-9', deviceId: 'd-live', publicKey: 'a'.repeat(64) }]);
  });
});
