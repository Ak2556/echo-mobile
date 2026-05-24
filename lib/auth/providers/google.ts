import Constants from 'expo-constants';
import { supabase } from '../../supabase';
import { CANCELLED, type ProviderResult } from '../types';

/**
 * Native Google Sign-In.
 *
 * This replaces the WebBrowser.openAuthSessionAsync flow that was structurally
 * unreliable on iOS — the browser promise could fail to resolve after a
 * successful redirect, leaving the UI spinning. The native SDK has no such
 * race: it returns synchronously when the user dismisses the system sheet.
 *
 * Setup (one-time, user-side):
 *
 *   1. In Google Cloud Console, create two OAuth 2.0 Client IDs:
 *        - iOS  (use bundle ID com.ak2556.echo, get the REVERSED_CLIENT_ID)
 *        - Web  (will be used as serverClientId — Supabase needs this one)
 *   2. In Supabase → Auth → Providers → Google, paste the Web client ID + secret.
 *   3. In .env (or EAS secrets):
 *        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS client ID>.apps.googleusercontent.com
 *        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web client ID>.apps.googleusercontent.com
 *   4. In app.json plugins, add the iOS URL scheme:
 *        ["@react-native-google-signin/google-signin",
 *          { "iosUrlScheme": "com.googleusercontent.apps.<REVERSED_CLIENT_ID>" }]
 *   5. Run `npx expo prebuild --clean` so the URL scheme makes it into Info.plist.
 *
 * Until those creds are wired, this provider returns a clear error instead
 * of crashing — Apple + email + phone still work.
 */

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin') | null;
let mod: GoogleSigninModule = null;
let modAttempted = false;
let configured = false;

function loadGoogleSignin(): GoogleSigninModule {
  if (modAttempted) return mod;
  modAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin');
  } catch {
    mod = null;
  }
  return mod;
}

function readClientIds(): { ios: string | undefined; web: string | undefined } {
  const fromEnv = {
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  };
  if (fromEnv.ios || fromEnv.web) return fromEnv;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return {
    ios: (extra.googleIosClientId as string | undefined) ?? undefined,
    web: (extra.googleWebClientId as string | undefined) ?? undefined,
  };
}

function configure(GoogleSignin: NonNullable<GoogleSigninModule>['GoogleSignin']): { ok: true } | { ok: false; error: string } {
  if (configured) return { ok: true };
  const ids = readClientIds();
  if (!ids.web) {
    return {
      ok: false,
      error: 'Google sign-in is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env and rebuild.',
    };
  }
  try {
    GoogleSignin.configure({
      iosClientId: ids.ios,
      webClientId: ids.web,
      // Skip Play Services check on iOS (no-op); we still call hasPlayServices on Android.
    });
    configured = true;
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Google sign-in configuration failed' };
  }
}

export async function signInWithGoogle(): Promise<ProviderResult> {
  const m = loadGoogleSignin();
  if (!m) {
    return {
      error: 'Google sign-in module not installed. Run `npm install @react-native-google-signin/google-signin` and rebuild.',
    };
  }

  const { GoogleSignin, statusCodes } = m;
  const conf = configure(GoogleSignin);
  if (!conf.ok) return { error: conf.error };

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    // v13+ returns { type: 'success' | 'cancelled', data?: ... }
    // v12 and below returned the user object directly.
    const idToken: string | undefined =
      (result as any)?.data?.idToken ??
      (result as any)?.idToken ??
      (await GoogleSignin.getTokens().catch(() => null))?.idToken;

    if (!idToken) {
      return { error: 'Google did not return an ID token. Please try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    return { error: error?.message ?? null };
  } catch (e: any) {
    const code = e?.code;
    if (
      code === statusCodes?.SIGN_IN_CANCELLED ||
      code === '-5' ||  // iOS cancel
      code === '12501' // Android cancel
    ) {
      return { error: CANCELLED };
    }
    if (code === statusCodes?.IN_PROGRESS) {
      return { error: 'A Google sign-in is already in progress.' };
    }
    if (code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      return { error: 'Google Play Services are not available on this device.' };
    }
    return { error: e?.message ?? 'Google sign-in failed' };
  }
}
