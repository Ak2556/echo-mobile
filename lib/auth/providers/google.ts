import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../supabase';
import type { ProviderResult } from '../types';
import { CANCELLED } from '../types';
import { consumeAuthCallbackUrl } from '../callback';
import { withAuthTimeout } from '../timeout';

/**
 * Google OAuth via the system browser (ASWebAuthenticationSession / Custom
 * Tabs). PKCE flow:
 *
 *   signInWithOAuth(skipBrowserRedirect) → provider URL
 *   → openAuthSessionAsync → echo://auth/callback?code=XYZ
 *   → consumeAuthCallbackUrl → exchangeCodeForSession → SIGNED_IN fires.
 *
 * The provider is enabled in Supabase (client ID/secret live in the
 * dashboard); `echo://auth/callback` is in additional_redirect_urls.
 */

const REDIRECT_TO = 'echo://auth/callback';

export async function signInWithGoogle(): Promise<ProviderResult> {
  try {
    const { data, error } = await withAuthTimeout(
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_TO,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      }),
    );
    if (error || !data?.url) {
      return { error: error?.message ?? 'Could not start Google sign-in.' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_TO);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: CANCELLED };
    }
    if (result.type !== 'success' || !result.url) {
      return { error: 'Google sign-in did not finish. Try again.' };
    }

    const outcome = await consumeAuthCallbackUrl(result.url);
    if (outcome.status === 'success') return { error: null };
    return {
      error: outcome.status === 'error' ? outcome.error : 'Google sign-in did not finish. Try again.',
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Google sign-in failed.' };
  }
}
