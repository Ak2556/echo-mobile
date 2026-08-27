import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';
import { supabase } from '../../supabase';
import { settleAuthSession } from '../browserSession';
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

    // openAuthSessionAsync does not resolve reliably when the tab is torn down
    // by something other than the user — another activity coming to the front,
    // a call, the OS reclaiming it. Left alone it hangs, and the sign-in screen
    // guards with `if (googleLoading) return`, so the button sticks on
    // "Signing in…" and refuses every retry until the app is force-quit.
    //
    // Returning to the foreground is the signal that the session is over one
    // way or another. See ../browserSession for how the two race.
    //
    // On iOS 'active' may never arrive at all — the Safari sheet is hosted
    // inside this app's own scene, so the app never leaves the foreground to
    // return to it. The subscription therefore cannot rely on its own handler
    // to unsubscribe; releaseForeground runs whatever happens.
    // Only a return from the *background* counts. Presenting the sheet makes
    // iOS resign active for ~2s (the "…wants to use google.com to Sign In"
    // alert), and treating that bounce as a return concluded the sign-in was
    // over while the user was still on Google's consent screen. Android's
    // Custom Tab genuinely backgrounds the app, so this still fires there;
    // on iOS the browser, poll and timeout arms settle the session instead.
    let releaseForeground = () => {};
    const foreground = new Promise<void>(resolve => {
      let wasBackgrounded = false;
      const sub = AppState.addEventListener('change', state => {
        if (state === 'background') wasBackgrounded = true;
        else if (state === 'active' && wasBackgrounded) resolve();
      });
      releaseForeground = () => sub.remove();
    });

    let settled;
    try {
      settled = await settleAuthSession({
        browser: WebBrowser.openAuthSessionAsync(data.url, REDIRECT_TO),
        foreground,
        hasSession: async () => Boolean((await supabase.auth.getSession()).data.session),
      });
    } finally {
      releaseForeground();
    }

    // Interrupted, but the redirect had already been consumed elsewhere — the
    // Linking listener and the callback screen both handle it. The user is
    // signed in; saying otherwise would be a lie with a toast attached.
    if (settled.kind === 'signed-in') return { error: null };
    if (settled.kind === 'cancelled') return { error: CANCELLED };

    const outcome = await consumeAuthCallbackUrl(settled.url);
    if (outcome.status === 'success') return { error: null };
    return {
      error: outcome.status === 'error' ? outcome.error : 'Google sign-in did not finish. Try again.',
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Google sign-in failed.' };
  }
}
