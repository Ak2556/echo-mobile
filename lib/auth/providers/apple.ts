import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../../supabase';
import type { ProviderResult } from '../types';
import { CANCELLED } from '../types';

/**
 * Sign in with Apple, native.
 *
 * Deliberately not modelled on ./google.ts. Google has to leave the app for a
 * system browser and then race a redirect against the app returning to the
 * foreground, which is where most of that file's length comes from. Apple's
 * sheet is presented by the OS inside this process and returns a credential
 * directly, so none of that machinery applies and reusing it would only add
 * ways to fail.
 *
 * The exchange is signInWithIdToken, not signInWithOAuth: Apple hands us a
 * signed identity token and Supabase verifies it against the Client IDs
 * configured on the provider. That list must contain this app's bundle ID
 * (com.downloadecho.echo) for the native path; the Services ID is only for
 * the web flow.
 *
 * Why this exists at all: App Store Review Guideline 4.8. The login screen
 * offers Google, so an equivalent privacy-preserving option is required or
 * the submission is rejected.
 */

/**
 * Whether the native sheet can be shown. iOS 13+ only, and false on every
 * other platform — Android and web have no native Apple sign-in, so the
 * button must not render there rather than render and fail on tap.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<ProviderResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // Apple returns name and email only on the very first authorisation for
    // this Apple ID, and never again — not on reinstall, not on a new device.
    // Anything we want from them has to be taken here or it is gone. The
    // identity token is the only part that arrives every time.
    if (!credential.identityToken) {
      return { error: 'Apple did not return an identity token. Try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    // Dismissing the sheet is a choice, not a failure. The login screen
    // treats CANCELLED as "put the button back" rather than showing a toast.
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      return { error: CANCELLED };
    }
    return { error: e instanceof Error ? e.message : 'Apple sign-in failed.' };
  }
}
