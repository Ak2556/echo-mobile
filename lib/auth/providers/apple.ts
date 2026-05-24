import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from '../../supabase';
import { CANCELLED, type ProviderResult } from '../types';

/**
 * Native Apple Sign-In.
 *
 * Flow:
 *   1. Generate random nonce + SHA256 hash it.
 *   2. AppleAuthentication.signInAsync({ nonce: hashedNonce }) → identityToken.
 *   3. supabase.auth.signInWithIdToken({ token, nonce: rawNonce }).
 *
 * No browser, no race conditions. The onAuthStateChange listener picks up
 * SIGNED_IN and routes from there.
 */
export async function signInWithApple(): Promise<ProviderResult> {
  if (Platform.OS !== 'ios') {
    return { error: 'Apple Sign-In is only available on iOS' };
  }

  try {
    const rawNonce = Array.from(await Crypto.getRandomBytesAsync(16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { error: 'Apple did not return an identity token. Please try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });

    return { error: error?.message ?? null };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { error: CANCELLED };
    return { error: e?.message ?? 'Apple Sign-In failed' };
  }
}
