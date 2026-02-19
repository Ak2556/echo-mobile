import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Returns the correct OAuth redirect URI for the current environment.
 *
 *  • Expo Go (simulator / device)  → exp://127.0.0.1:8081/--/auth/callback
 *  • Production / dev build        → echo://auth/callback
 *
 * Both URLs must be added to the Supabase "Redirect URLs" allowlist
 * (Authentication → URL Configuration → Redirect URLs).
 */
function getRedirectUri(): string {
  return Linking.createURL('auth/callback');
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  // Warm up the browser process on Android for a snappier sheet.
  if (Platform.OS === 'android') {
    await WebBrowser.warmUpAsync().catch(() => {});
  }
  try {
    const redirectUri = getRedirectUri();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error: error.message };
    if (!data.url) return { error: 'No OAuth URL returned' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: '__cancelled__' };
    }

    if (result.type === 'success') {
      const url = new URL(result.url);
      // Supabase returns tokens in the hash fragment; fall back to query string
      const fragment = url.hash.slice(1) || url.search.slice(1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    }
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'Google sign-in failed' };
  } finally {
    if (Platform.OS === 'android') {
      await WebBrowser.coolDownAsync().catch(() => {});
    }
  }
}

export async function signInWithApple(): Promise<{ error: string | null }> {
  if (Platform.OS !== 'ios') return { error: 'Apple Sign-In is only available on iOS' };
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

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken!,
      nonce: rawNonce,
    });

    return { error: error?.message ?? null };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null };
    return { error: e?.message ?? 'Apple Sign-In failed' };
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
