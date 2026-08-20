import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../../lib/supabase';

// Override TweetNaCl's random byte generator to use Expo Crypto for React Native compatibility
nacl.setPRNG((x: Uint8Array, n: number) => {
  const randomBytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) {
    x[i] = randomBytes[i];
  }
});

const KEYPAIR_STORAGE_KEY = 'echo_e2ee_keypair';

export interface E2EEKeyPair {
  publicKey: string; // Base64
  secretKey: string; // Base64
}

/**
 * Retrieves the current device's E2EE keypair, generating and uploading a new one if it doesn't exist.
 */
export async function getOrGenerateKeyPair(): Promise<E2EEKeyPair> {
  const storedStr = await SecureStore.getItemAsync(KEYPAIR_STORAGE_KEY);
  if (storedStr) {
    return JSON.parse(storedStr);
  }

  // Generate a new Curve25519 keypair for box (public-key authenticated encryption)
  const keyPair = nacl.box.keyPair();
  const serialized: E2EEKeyPair = {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey),
  };

  // Securely store on device
  await SecureStore.setItemAsync(KEYPAIR_STORAGE_KEY, JSON.stringify(serialized));

  // Upload public key to Supabase for others to encrypt messages sent to us
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('users').update({
      public_key: serialized.publicKey,
    }).eq('id', user.id);
  }

  return serialized;
}

/**
 * Fetches a user's public key from Supabase
 */
export async function getUserPublicKey(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('public_key')
    .eq('id', userId)
    .single();
    
  if (error || !data?.public_key) return null;
  return data.public_key;
}

/**
 * Encrypts a message payload for a specific recipient.
 */
export async function encryptMessage(
  payloadStr: string,
  recipientPublicKeyBase64: string
): Promise<string> {
  const { secretKey } = await getOrGenerateKeyPair();
  
  const ephemeralKeyPair = nacl.box.keyPair();
  const nonce = Crypto.getRandomBytes(nacl.box.nonceLength);
  const messageUint8 = naclUtil.decodeUTF8(payloadStr);
  const recipientPublicKey = naclUtil.decodeBase64(recipientPublicKeyBase64);
  const mySecretKey = naclUtil.decodeBase64(secretKey);

  const encryptedBox = nacl.box(
    messageUint8,
    nonce,
    recipientPublicKey,
    mySecretKey
  );

  // We return a packaged string containing the nonce and the cipher
  const fullMessage = new Uint8Array(nonce.length + encryptedBox.length);
  fullMessage.set(nonce);
  fullMessage.set(encryptedBox, nonce.length);

  return naclUtil.encodeBase64(fullMessage);
}

/**
 * Decrypts a message payload from a specific sender.
 */
export async function decryptMessage(
  encryptedPayloadBase64: string,
  senderPublicKeyBase64: string
): Promise<string | null> {
  try {
    const { secretKey } = await getOrGenerateKeyPair();
    
    const messageWithNonceAsUint8Array = naclUtil.decodeBase64(encryptedPayloadBase64);
    const nonce = messageWithNonceAsUint8Array.slice(0, nacl.box.nonceLength);
    const message = messageWithNonceAsUint8Array.slice(
      nacl.box.nonceLength,
      messageWithNonceAsUint8Array.length
    );

    const senderPublicKey = naclUtil.decodeBase64(senderPublicKeyBase64);
    const mySecretKey = naclUtil.decodeBase64(secretKey);

    const decrypted = nacl.box.open(message, nonce, senderPublicKey, mySecretKey);

    if (!decrypted) {
      return null;
    }

    return naclUtil.encodeUTF8(decrypted);
  } catch (err) {
    console.error('Decryption failed', err);
    return null;
  }
}
