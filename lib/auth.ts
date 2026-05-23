import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { consumeAuthCallbackUrl } from './authCallback';

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

const OAUTH_TIMEOUT_MS = 90_000;

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
    if (error) {
      console.warn('[oauth] supabase signInWithOAuth failed', error);
      return { error: error.message };
    }
    if (!data.url) {
      return { error: 'No OAuth URL returned from Supabase. Check that the Google provider is enabled in Supabase Auth → Providers.' };
    }

    // iOS can leave WebBrowser.openAuthSessionAsync unresolved even after the
    // deep link has been consumed by Linking. Race the browser with Supabase's
    // auth event and a hard timeout so the UI never spins forever.
    type ExternalResult =
      | { kind: 'browser'; result: WebBrowser.WebBrowserAuthSessionResult }
      | { kind: 'browser-error'; error: unknown }
      | { kind: 'session' }
      | { kind: 'timeout' };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolveSessionEvent!: (value: ExternalResult) => void;
    const sessionPromise = new Promise<ExternalResult>((resolve) => {
      resolveSessionEvent = resolve;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session) {
        resolveSessionEvent({ kind: 'session' });
      }
    });

    const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUri).then(
      (r) => ({ kind: 'browser' as const, result: r }),
      (error) => ({ kind: 'browser-error' as const, error }),
    );

    const timeoutPromise = new Promise<ExternalResult>((resolve) => {
      timeoutId = setTimeout(() => resolve({ kind: 'timeout' }), OAUTH_TIMEOUT_MS);
    });

    const winner = await Promise.race([browserPromise, sessionPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    subscription.unsubscribe();

    // If the Linking handler set the session first, just dismiss the
    // dangling browser sheet and report success — the AuthListener in
    // _layout.tsx is already navigating us forward.
    if (winner.kind === 'session') {
      WebBrowser.dismissAuthSession();
      return { error: null };
    }

    if (winner.kind === 'timeout') {
      WebBrowser.dismissAuthSession();
      return { error: 'Google sign-in timed out. Please try again.' };
    }

    if (winner.kind === 'browser-error') {
      console.warn('[oauth] WebBrowser failed', winner.error);
      return { error: (winner.error as any)?.message ?? 'Google sign-in failed' };
    }

    const result = winner.result;

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: '__cancelled__' };
    }

    if (result.type !== 'success') {
      console.warn('[oauth] WebBrowser returned non-success:', result.type);
      return { error: `Google sign-in did not complete (${result.type}).` };
    }

    const callback = await consumeAuthCallbackUrl(result.url);
    if (callback.status === 'success') {
      return { error: null };
    }
    if (callback.status === 'error') {
      console.warn('[oauth] callback failed', callback.error);
      return { error: callback.error };
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) return { error: null };

    console.warn('[oauth] callback URL had neither tokens nor code', result.url);
    return {
      error:
        'Google sign-in returned without credentials. Check that the redirect URI is whitelisted in Supabase (Authentication → URL Configuration → Redirect URLs).',
    };
  } catch (e: any) {
    console.warn('[oauth] exception', e);
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
    if (e?.code === 'ERR_REQUEST_CANCELED') return { error: '__cancelled__' };
    return { error: e?.message ?? 'Apple Sign-In failed' };
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
