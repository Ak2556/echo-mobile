/**
 * This device's end-to-end encryption identity.
 *
 * One X25519 keypair per device per account. The private half lives in the
 * keychain on iOS/Android (AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, so a
 * notification quick-reply can seal while the phone is locked, and it never
 * rides a backup to another device). On web/macOS it lives in localStorage,
 * beside the session token, which is the same trust level the session already
 * has there. The public half is published to public.user_devices.
 *
 * The local key is written BEFORE the row is published, so a published key
 * whose private half was lost cannot exist.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { supabase } from '../supabase';
import { E2EEError, generateDeviceKeyPair, type DeviceKeyPair } from './crypto';

export type LocalDevice = { userId: string; deviceId: string; keyPair: DeviceKeyPair };
export type TargetDeviceRow = { userId: string; deviceId: string; publicKey: string };

const HEX_KEY = /^[0-9a-f]{64}$/;
const storageKey = (userId: string) => `echo.e2ee.device.${userId}`;
const isWebLike = () => Platform.OS === 'web';
const platformLabel = (): 'ios' | 'android' | 'web' | 'macos' =>
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'macos' ? Platform.OS : 'web';

async function readRaw(userId: string): Promise<string | null> {
  if (isWebLike()) {
    try { return globalThis.localStorage?.getItem(storageKey(userId)) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(storageKey(userId));
}

async function writeRaw(userId: string, value: string): Promise<void> {
  if (isWebLike()) {
    try {
      globalThis.localStorage.setItem(storageKey(userId), value);
      return;
    } catch {
      throw new E2EEError('key_storage_unavailable');
    }
  }
  await SecureStore.setItemAsync(storageKey(userId), value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

async function deleteRaw(userId: string): Promise<void> {
  if (isWebLike()) {
    try { globalThis.localStorage?.removeItem(storageKey(userId)); } catch { /* nothing to remove */ }
    return;
  }
  await SecureStore.deleteItemAsync(storageKey(userId));
}

export async function getLocalDevice(userId: string): Promise<LocalDevice | null> {
  const raw = await readRaw(userId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalDevice;
    const ok = parsed.userId === userId
      && typeof parsed.deviceId === 'string'
      && HEX_KEY.test(parsed.keyPair?.publicKey ?? '')
      && HEX_KEY.test(parsed.keyPair?.privateKey ?? '');
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

async function register(userId: string): Promise<LocalDevice> {
  const stored = await getLocalDevice(userId);
  if (stored) {
    const { data, error } = await supabase
      .from('user_devices')
      .select('id, revoked_at')
      .eq('id', stored.deviceId)
      .maybeSingle();
    // A transient failure must not discard a working key: every message sealed
    // to it would become unreadable.
    if (error) throw error;
    if (data && !data.revoked_at) {
      void supabase.from('user_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', stored.deviceId);
      return stored;
    }
    // Revoked or gone: this key can never receive again. Start over.
  }

  const device: LocalDevice = { userId, deviceId: randomUUID(), keyPair: generateDeviceKeyPair(getRandomBytes) };
  await writeRaw(userId, JSON.stringify(device));
  const { error } = await supabase.from('user_devices').insert({
    id: device.deviceId,
    user_id: userId,
    public_key: device.keyPair.publicKey,
    label: platformLabel(),
  });
  if (error) throw error;
  return device;
}

const inFlight = new Map<string, Promise<LocalDevice>>();

export function ensureDeviceRegistered(userId: string): Promise<LocalDevice> {
  const running = inFlight.get(userId);
  if (running) return running;
  const run = register(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}

export async function revokeLocalDevice(userId: string): Promise<void> {
  const stored = await getLocalDevice(userId);
  if (stored) {
    await supabase.from('user_devices').update({ revoked_at: new Date().toISOString() }).eq('id', stored.deviceId);
  }
  await deleteRaw(userId);
}

export async function fetchTargetDevices(userIds: string[]): Promise<TargetDeviceRow[]> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('id, user_id, public_key')
    .in('user_id', userIds)
    .is('revoked_at', null);
  if (error) throw error;
  return ((data ?? []) as { id: string; user_id: string; public_key: string }[])
    .map(r => ({ userId: r.user_id, deviceId: r.id, publicKey: r.public_key }));
}
