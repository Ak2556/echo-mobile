import { useEffect } from 'react';
import { Linking } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useAppStore } from '../../store/useAppStore';
import { identify, resetIdentity, track } from '../../src/shared/lib/analytics';
import { identifyUser, clearUser, captureException } from '../monitoring';
import { isSupabaseRemote } from '../remoteConfig';
import { fetchRemoteBlocks, fetchRemoteMutes, fetchAndApplyRemoteSettings } from '../supabaseEchoApi';
import { loadPersonaProfile } from '../persona';
import { syncNotificationProfile } from '../personalNudges';
import { useAuthStore } from './store';
import { destinationFor } from './destination';
import type { AuthProfile, AuthStatus } from './types';
import { consumeAuthCallbackUrl, hasAuthCallbackPayload, parseAuthCallbackUrl } from './callback';
import { withAuthTimeout } from './timeout';

/**
 * THE single auth listener.
 *
 * Mounted once at the root of the app via <AuthListenerProvider />.
 * Responsibilities:
 *   1. Cold-start session check → set status to 'signed-out' | 'needs-onboarding' | 'ready'
 *   2. Subscribe to onAuthStateChange — hydrate store + analytics on SIGNED_IN,
 *      clear on SIGNED_OUT.
 *   3. Listen for deep links — both Universal Links (echo.app/e/<id>) and
 *      auth callbacks (echo://auth/callback?code=…).
 *
 * No other file should call supabase.auth.getSession() or subscribe to
 * onAuthStateChange. Read auth state via useAuth() from lib/auth.
 */

// Which user's block/mute lists we've already hydrated this session — prevents
// the cold-start double-hydrate from applying the server lists twice.
let blocksHydratedFor: string | null = null;

async function fetchProfile(userId: string): Promise<AuthProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_color, avatar_url, is_private, dm_privacy, activity_status, online_status, read_receipts, sensitive_content_filter, personalized_notifications')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

async function hydrateFromSession(session: Session | null): Promise<void> {
  const auth = useAuthStore.getState();
  const app = useAppStore.getState();

  if (!session) {
    auth.setAuth({ status: 'signed-out', session: null, profile: null });
    return;
  }

  const profile = await fetchProfile(session.user.id);
  const hasUsername = Boolean(profile?.username);

  auth.setAuth({
    status: hasUsername ? 'ready' : 'needs-onboarding',
    session,
    profile,
  });

  // Mirror identity bits into useAppStore so the rest of the app — which
  // still reads from it — stays consistent. New code should read from
  // useAuth(); this mirroring is the migration bridge.
  app.setUserId(session.user.id);
  app.setPersonaLearningEnabled(loadPersonaProfile(session.user.id).enabled);
  if (profile?.username) {
    app.setUsername(profile.username);
    app.setDisplayName(profile.display_name ?? '');
    app.setBio(profile.bio ?? '');
    app.setAvatarColor(profile.avatar_color ?? '#6366F1');
    if (profile.avatar_url || app.profilePhotoVisible) {
      app.setAvatarUrl(profile.avatar_url ?? '');
    }
    app.setHasSeenOnboarding(true);

    if (profile.is_private !== undefined) app.setPrivateAccount(profile.is_private);
    if (profile.dm_privacy) app.setDmPrivacy(profile.dm_privacy);
    if (profile.sensitive_content_filter !== undefined) app.setSensitiveContentFilter(profile.sensitive_content_filter);
    if (profile.personalized_notifications !== undefined) app.setPersonalizedNotifications(profile.personalized_notifications);
  }

  // Hydrate block/mute lists + cross-device settings in the background — non-fatal.
  // Guarded to run once per user: hydrateFromSession fires twice on cold start
  // (getSession + the INITIAL_SESSION event), and applying the lists via the
  // toggle (a flip) used to race and silently UN-block/UN-mute people. Set the
  // guard before the async work so the concurrent second call skips it.
  if (isSupabaseRemote() && blocksHydratedFor !== session.user.id) {
    blocksHydratedFor = session.user.id;
    Promise.all([fetchRemoteBlocks(), fetchRemoteMutes(), fetchAndApplyRemoteSettings()])
      .then(([blockedIds, mutedIds]) => {
        const s = useAppStore.getState();
        // Idempotent union — safe under concurrent runs, no flip. (Server-only
        // removals don't propagate here; a full reconcile is a separate concern.)
        s.setBlockedIds([...s.blockedIds, ...blockedIds]);
        s.setMutedIds([...s.mutedIds, ...mutedIds]);
        // Now that remote consent is applied, sync (or clear) the server-side
        // notification profile for personalized fan-out. Gated on consent.
        void syncNotificationProfile(s.personalizedNotifications);
      })
      .catch(() => { blocksHydratedFor = null; });
  }
}

export async function refreshAuthSession(): Promise<AuthStatus> {
  const { data: { session } } = await withAuthTimeout(supabase.auth.getSession());
  await hydrateFromSession(session);
  return useAuthStore.getState().status;
}

async function handleDeepLink(url: string): Promise<void> {
  // Universal Links → in-app navigation. Don't touch auth.
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'echo.app' || parsed.hostname === 'www.echo.app') {
      // The root layout handles route push for universal links.
      return;
    }
  } catch { /* fall through */ }

  if (!hasAuthCallbackPayload(url)) return;

  const params = parseAuthCallbackUrl(url);
  const result = await consumeAuthCallbackUrl(url);

  if (result.status === 'error') {
    captureException(new Error(`auth callback ${params.type}: ${result.error}`), { tags: { source: 'auth_callback' } });
    return;
  }
  // On success, onAuthStateChange fires SIGNED_IN and the subscription
  // below picks it up. Nothing else to do here.
}

/**
 * Apply destinationFor. Called on mount and whenever the route or the status
 * moves, so a screen that arrives after the status has settled is routed too.
 * Idempotent: destinationFor returns null when the user is already right.
 */
function routeFor(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  status: AuthStatus,
): void {
  const destination = destinationFor(pathname, status);
  if (destination) router.replace(destination);
}

/**
 * Mount this provider once at the root of the app. Idempotent — only the
 * first mount starts the subscription; subsequent mounts are no-ops.
 *
 * Also watches auth status and pushes navigation transitions. Without this,
 * a screen like /auth/phone that finishes verifyOtp would update the store
 * but never navigate — app/index.tsx is the only redirect surface and it's
 * not mounted while another auth screen is.
 */
let started = false;

export function AuthListenerProvider(): null {
  const router = useRouter();
  const pathname = usePathname();

  // Status-driven navigation. Runs whenever status changes — pushes the
  // current view to the right destination if it's stale.
  const status = useAuthStore(s => s.status);

  useEffect(() => {
    // Level-triggered, deliberately. This used to subscribe to the store and
    // act only when the status differed from the previous one, which loses
    // every case where the status settled before the screen asking about it
    // mounted — the Google callback being the one users hit. Reading the
    // current status as a hook re-runs this on arrival as well as on change,
    // so the question is answered whenever either side moves.
    routeFor(router, pathname, status);
  }, [router, pathname, status]);

  useEffect(() => {
    if (started) return;
    started = true;

    // Cold-start session check. Keep the auth store from staying in
    // 'checking' if the platform auth client never resolves.
    withAuthTimeout(supabase.auth.getSession()).then(({ data: { session } }) => {
      hydrateFromSession(session);
    }).catch(() => {
      useAuthStore.getState().setAuth({ status: 'signed-out', session: null, profile: null });
    });

    // The ONE onAuthStateChange subscription.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        track('signin_completed');
        identify(session.user.id);
        identifyUser(session.user.id);
        await hydrateFromSession(session);
      } else if (event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        await hydrateFromSession(session);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        useAuthStore.getState().setSession(session);
      } else if (event === 'SIGNED_OUT') {
        track('signout');
        resetIdentity();
        clearUser();
        blocksHydratedFor = null;
        useAuthStore.getState().reset();
        // Clear mirrored fields in useAppStore. The components that still
        // read from useAppStore will pick up empty strings and re-route.
        const app = useAppStore.getState();
        app.setUserId('');
        app.setUsername('');
        app.setDisplayName('');
        app.setBio('');
        app.setAvatarColor('#6366F1');
        app.setAvatarUrl('');
        app.setHasSeenOnboarding(false);
        app.setHasCompletedProductOnboarding(false);
        app.setOnboardingDraftCreated(false);
        app.resetSocialData();
        app.clearChatHistory();
      }
    });

    // Deep-link handlers — cold-start + while-running.
    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => {
      subscription.unsubscribe();
      sub.remove();
      started = false;
    };
  }, []);

  return null;
}
