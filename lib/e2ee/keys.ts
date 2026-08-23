/**
 * Device keys — the half of E2EE that touches the device and the network.
 *
 * The private key is generated on this device, written to the OS keystore
 * (Keychain on iOS, Keystore on Android via expo-secure-store) and never
 * transmitted anywhere. Only the public half is published, to
 * profiles.public_key, so other people can encrypt to this account.
 *
 * That is the whole basis of the claim "Echo cannot read your messages": there
 * is no copy of the private key on any server, so there is nothing to hand
 * over, subpoena or breach.
 *
 * The consequence, stated plainly because it must reach the user: a new device
 * generates a new key and cannot read anything sent to the old one. There is
 * no escrow and no history migration. That is the honest trade.
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabase';
import { generateKeyPair, type KeyPair, type Recipient } from './crypto';

const STORAGE_KEY = 'echo.e2ee.deviceKey.v1';

/**
 * Cryptographically secure randomness from the platform.
 *
 * tweetnacl has no usable PRNG under React Native, and its fallback is to
 * throw rather than silently weaken — which is correct. This routes it to the
 * platform CSPRNG. Injected rather than global so crypto.ts stays pure and the
 * scheme is testable in Node.
 */
export function deviceRandomBytes(length: number): Uint8Array {
  return Crypto.getRandomBytes(length);
}

let cached: KeyPair | null = null;

/**
 * The keypair for this device, generating and publishing one on first use.
 *
 * Cached in memory for the session: reading the keystore prompts on some
 * Android configurations, and a chat screen decrypts many messages.
 */
export async function getDeviceKeyPair(): Promise<KeyPair> {
  if (cached) return cached;

  const stored = await SecureStore.getItemAsync(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as KeyPair;
      if (parsed?.publicKey && parsed?.secretKey) {
        cached = parsed;
        return parsed;
      }
    } catch {
      // Corrupt entry: fall through and mint a new key rather than wedging
      // the user out of messaging entirely.
    }
  }

  const pair = generateKeyPair(deviceRandomBytes);
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(pair), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  cached = pair;
  await publishPublicKey(pair.publicKey);
  return pair;
}

/**
 * Publish the public half so others can encrypt to this account.
 *
 * Idempotent: called on first key creation and again at sign-in, because a
 * reinstall leaves a keystore entry the server has never seen.
 */
export async function publishPublicKey(publicKey: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('profiles')
    .update({ public_key: publicKey, key_updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) throw error;
}

/** Ensure the published key matches this device's, repairing drift. */
export async function ensurePublishedKey(): Promise<void> {
  const pair = await getDeviceKeyPair();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('id', user.id)
    .single();

  if (data?.public_key !== pair.publicKey) {
    await publishPublicKey(pair.publicKey);
  }
}

/**
 * Public keys for everyone in a conversation except the caller.
 *
 * Returns participants with no key too, so the caller can name them rather
 * than fail with something vague. Sending must refuse in that case — never
 * fall back to plaintext.
 */
export async function getConversationRecipients(
  conversationId: string,
): Promise<{ recipients: Recipient[]; missing: string[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const [{ data: convo }, { data: members }] = await Promise.all([
    supabase.from('dm_conversations').select('user_a, user_b').eq('id', conversationId).maybeSingle(),
    supabase.from('dm_conversation_members').select('user_id').eq('conversation_id', conversationId),
  ]);

  const ids = new Set<string>();
  if (convo) {
    if (convo.user_a) ids.add(convo.user_a);
    if (convo.user_b) ids.add(convo.user_b);
  }
  for (const m of members ?? []) if (m.user_id) ids.add(m.user_id);
  ids.delete(user.id);

  if (ids.size === 0) return { recipients: [], missing: [] };

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, public_key, username')
    .in('id', [...ids]);
  if (error) throw error;

  const recipients: Recipient[] = [];
  const missing: string[] = [];
  for (const p of profiles ?? []) {
    if (p.public_key) recipients.push({ userId: p.id, publicKey: p.public_key });
    else missing.push(p.username ?? p.id);
  }
  // A participant with no profile row at all is still a participant we cannot
  // encrypt to; counting them keeps the refusal honest.
  const seen = new Set((profiles ?? []).map(p => p.id));
  for (const id of ids) if (!seen.has(id)) missing.push(id);

  return { recipients, missing };
}

/** Forget the in-memory key. Called on sign-out; the keystore entry stays. */
export function clearCachedKeyPair(): void {
  cached = null;
}

/**
 * Destroy this device's key permanently.
 *
 * Every message previously sent to this device becomes unreadable, which is
 * the intended behaviour for "reset my encryption" and must be spelled out in
 * the UI before it runs.
 */
export async function destroyDeviceKey(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
