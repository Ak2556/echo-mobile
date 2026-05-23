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
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[oauth] supabase signInWithOAuth failed', error);
      return { error: error.message };
    }
    if (!data.url) {
      return { error: 'No OAuth URL returned from Supabase. Check that the Google provider is enabled in Supabase Auth → Providers.' };
    }

    // iOS has a known SFAuthSession race where the WebBrowser promise can
    // hang forever even after the redirect has already been consumed by the
    // app's Linking handler in app/_layout.tsx (which calls setSession itself
    // on auth-token URLs). To avoid stranding the caller on a spinner, race
    // the WebBrowser promise against the next SIGNED_IN event from supabase.
    // Whichever resolves first wins; the WebBrowser is dismissed if the auth
    // event won.
    type ExternalResult =
      | { kind: 'browser'; result: WebBrowser.WebBrowserAuthSessionResult }
      | { kind: 'session' };

    let sessionResolved = false;
    const sessionPromise = new Promise<ExternalResult>((resolve) => {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (sessionResolved) return;
          sessionResolved = true;
          sub.subscription.unsubscribe();
          resolve({ kind: 'session' });
        }
      });
    });

    const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUri).then(
      (r) => ({ kind: 'browser' as const, result: r }),
    );

    const winner = await Promise.race([browserPromise, sessionPromise]);

    // If the Linking handler set the session first, just dismiss the
    // dangling browser sheet and report success — the AuthListener in
    // _layout.tsx is already navigating us forward.
    if (winner.kind === 'session') {
      WebBrowser.dismissAuthSession();
      return { error: null };
    }

    const result = winner.result;

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: '__cancelled__' };
    }

    if (result.type !== 'success') {
      // eslint-disable-next-line no-console
      console.warn('[oauth] WebBrowser returned non-success:', result.type);
      return { error: `Google sign-in did not complete (${result.type}).` };
    }

    const url = new URL(result.url);
    // Two possible response shapes:
    // 1. Implicit flow — tokens in the URL hash fragment (#access_token=…&refresh_token=…)
    // 2. PKCE flow — single-use code in the query string (?code=…) that needs to be exchanged
    const fragment = url.hash.slice(1);
    const search = url.search.slice(1);
    const hashParams = new URLSearchParams(fragment);
    const queryParams = new URLSearchParams(search);

    const accessToken = hashParams.get('access_token') ?? queryParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');
    const code = queryParams.get('code') ?? hashParams.get('code');
    const oauthError = hashParams.get('error') ?? queryParams.get('error');
    const oauthErrorDescription =
      hashParams.get('error_description') ?? queryParams.get('error_description');

    if (oauthError) {
      // eslint-disable-next-line no-console
      console.warn('[oauth] provider returned error', oauthError, oauthErrorDescription);
      return { error: `${oauthError}: ${oauthErrorDescription ?? 'no description'}` };
    }

    if (accessToken && refreshToken) {
      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setErr) {
        // eslint-disable-next-line no-console
        console.warn('[oauth] setSession failed', setErr);
        return { error: setErr.message };
      }
      return { error: null };
    }

    if (code) {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) {
        // eslint-disable-next-line no-console
        console.warn('[oauth] exchangeCodeForSession failed', exErr);
        return { error: exErr.message };
      }
      return { error: null };
    }

    // eslint-disable-next-line no-console
    console.warn('[oauth] callback URL had neither tokens nor code', result.url);
    return {
      error:
        'Google sign-in returned without credentials. Check that the redirect URI is whitelisted in Supabase (Authentication → URL Configuration → Redirect URLs).',
    };
  } catch (e: any) {
    // eslint-disable-next-line no-console
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
