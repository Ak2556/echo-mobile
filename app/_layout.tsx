import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppErrorBoundary } from '../components/common/AppErrorBoundary';
import { track, identify, resetIdentity } from '../lib/analytics';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ToastProvider, showToast } from '../components/ui/Toast';
import { CommandPalette } from '../components/ai/CommandPalette';
import { supabase } from '../lib/supabase';
import { useCommandPalette } from '../lib/commandPalette';
import { useAppStore } from '../store/useAppStore';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { fetchRemoteBlocks, fetchRemoteMutes } from '../lib/supabaseEchoApi';
import { persistGet, persistSet, persistDelete } from '../store/persist';
import '../global.css';

// One-time migration: evict stale seed/mock data persisted before v2.
const DATA_VERSION = 2;
if (persistGet<number>('_dataVersion', 0) < DATA_VERSION) {
  ['notifications', 'conversations', 'messagesByConversation', 'stories'].forEach(persistDelete);
  persistSet('_dataVersion', DATA_VERSION);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 30,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorBoundary {...props} />;
}

// Module-level flag: set when a password-recovery deep link is being processed.
// Prevents onAuthStateChange from immediately navigating away to /(tabs)/discover.
let pendingPasswordRecovery = false;

function AuthListener() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setUserId, setUsername, setDisplayName, setAvatarColor, setHasSeenOnboarding, resetSocialData, clearChatHistory } = useAppStore();

  // Exchange token from deep-link URL (email confirmation / OAuth callback).
  // Works with both the production scheme (echo://) and Expo Go (exp://).
  const handleDeepLink = async (url: string) => {
    // Universal Links: https://echo.app/e/<id> → /thread/<id>,
    //                  https://echo.app/u/<id> → /user/<id>,
    //                  https://echo.app/c/<id> → /comments/<id>.
    // The web side hosts an apple-app-site-association file at
    // /.well-known/apple-app-site-association so iOS opens these URLs in the
    // app instead of Safari. The route table here mirrors that AASA file.
    try {
      const parsed = new URL(url);
      const isUniversal = parsed.hostname === 'echo.app' || parsed.hostname === 'www.echo.app';
      if (isUniversal) {
        const [, prefix, id] = parsed.pathname.split('/');
        if (prefix === 'e' && id) { router.push(`/thread/${id}` as any); return; }
        if (prefix === 'u' && id) { router.push(`/user/${id}` as any); return; }
        if (prefix === 'c' && id) { router.push(`/comments/${id}` as any); return; }
      }
    } catch { /* malformed URL — fall through to auth handling */ }

    // Only act on URLs that carry Supabase auth tokens.
    if (!url.includes('access_token') && !url.includes('type=signup') && !url.includes('type=recovery')) return;

    // Supabase appends tokens in the hash fragment (#) or query string (?).
    const raw = url.split('#')[1] ?? url.split('?')[1] ?? '';
    const params = Object.fromEntries(
      raw.split('&').map(p => {
        const [k, ...v] = p.split('=');
        return [decodeURIComponent(k ?? ''), decodeURIComponent(v.join('='))];
      }),
    );
    if (params.access_token && params.refresh_token) {
      if (params.type === 'recovery') {
        // Mark recovery so onAuthStateChange doesn't navigate to discover.
        pendingPasswordRecovery = true;
      }
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) {
        pendingPasswordRecovery = false;
        showToast('Authentication failed. Please sign in again.', '❌');
        router.replace('/auth/login');
      } else if (params.type === 'recovery') {
        // Navigate to the reset-password screen now that session is active.
        router.replace('/auth/reset-password');
      }
      // For non-recovery flows, onAuthStateChange handles navigation.
    }
  };

  useEffect(() => {
    // Handle cold-start deep link
    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url); });
    // Handle deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, setAvatarColor, setDisplayName, setHasSeenOnboarding, setUserId, setUsername]); // handleDeepLink is stable — it only uses router and supabase which are stable

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Recovery flow: session was set by handleDeepLink, screen is /auth/reset-password.
      // Don't redirect — let the reset-password screen handle it.
      if (pendingPasswordRecovery && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        if (event === 'SIGNED_IN') pendingPasswordRecovery = false;
        return;
      }
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        setUserId(session.user.id);
        if (event === 'SIGNED_IN') {
          track('signin_completed');
          identify(session.user.id);
        }
        if (!useAppStore.getState().username) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_color')
            .eq('id', session.user.id)
            .single();

          if (profile?.username) {
            setUsername(profile.username);
            setDisplayName(profile.display_name ?? '');
            setAvatarColor(profile.avatar_color ?? '#6366F1');
            setHasSeenOnboarding(true);
            router.replace('/(tabs)/discover');
          } else {
            router.replace('/auth/signup-wizard');
          }
        } else {
          router.replace('/(tabs)/discover');
        }

        // Hydrate block/mute lists from Supabase so feed filtering is cross-device
        if (isSupabaseRemote()) {
          try {
            const [blockedIds, mutedIds] = await Promise.all([
              fetchRemoteBlocks(),
              fetchRemoteMutes(),
            ]);
            const store = useAppStore.getState();
            // Merge remote lists into local store (add any missing, keep existing)
            const currentBlocked = new Set(store.blockedIds);
            const currentMuted = new Set(store.mutedIds);
            blockedIds.forEach(id => { if (!currentBlocked.has(id)) store.toggleBlock(id); });
            mutedIds.forEach(id => { if (!currentMuted.has(id)) store.toggleMute(id); });
          } catch {
            // Non-fatal — local MMKV state is the fallback
          }
        }
      } else if (event === 'SIGNED_OUT') {
        track('signout');
        resetIdentity();
        setUserId('');
        setUsername('');
        setDisplayName('');
        setHasSeenOnboarding(false);
        resetSocialData();
        clearChatHistory();
        queryClient.clear();
        router.replace('/auth/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, setAvatarColor, setDisplayName, setHasSeenOnboarding, setUserId, setUsername, resetSocialData, clearChatHistory, queryClient]);

  return null;
}

export default function RootLayout() {
  const commandPaletteOpen = useCommandPalette(s => s.isOpen);

  // One app_open per cold start. Background→foreground transitions are
  // tracked separately via AppState in lib/supabase.ts (auto-refresh).
  useEffect(() => {
    track('app_open');
  }, []);

  // Push notification taps. The send-push edge fn embeds {kind, target_id}
  // in the notification's data payload; we route from those here. Cold-start
  // taps come through getLastNotificationResponseAsync(); foreground taps
  // come through the response listener. Treat both the same way.
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const route = (data: Record<string, unknown> | null | undefined) => {
      if (!data) return;
      const kind = String(data.kind ?? '');
      const targetId = String(data.target_id ?? data.echo_id ?? data.user_id ?? '');
      if (!targetId) return;
      track('notification_tapped', { kind });
      if (kind === 'follow') router.push(`/user/${targetId}` as any);
      else if (kind === 'comment' || kind === 'reaction' || kind === 'like' || kind === 'quote' || kind === 'mention' || kind === 'repost' || kind === 'bookmark') {
        router.push(`/thread/${targetId}` as any);
      } else if (kind === 'dm') {
        router.push(`/messages/${targetId}` as any);
      } else {
        router.push(`/thread/${targetId}` as any);
      }
    };

    // Handle the case where the app was launched by tapping a notification
    // while it was closed. Fire-and-forget; the route push needs the router
    // to be mounted, which it is by the time this effect runs.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      route(response.notification.request.content.data as Record<string, unknown>);
    });

    // Foreground / background-to-foreground taps.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data as Record<string, unknown>);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthListener />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="thread/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="comments/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="user/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/index" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="followers" options={{ presentation: 'card' }} />
          <Stack.Screen name="bookmarks" options={{ presentation: 'card' }} />
          <Stack.Screen name="settings" options={{ presentation: 'card' }} />
          <Stack.Screen name="ai-memory" options={{ presentation: 'card' }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'card' }} />
          <Stack.Screen name="report" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="blocked-users" options={{ presentation: 'card' }} />
          <Stack.Screen name="notification-prefs" options={{ presentation: 'card' }} />
          <Stack.Screen name="delete-account" options={{ presentation: 'card' }} />
          <Stack.Screen name="story" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="create-post" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="create-story" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="edit-post" options={{ presentation: 'modal', animation: 'fade' }} />
          {/* Mini Apps */}
          <Stack.Screen name="mini-apps/calculator" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/converter" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/bill-splitter" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/pomodoro" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/password-gen" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/world-clock" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/json-formatter" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/markdown" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/color-tools" options={{ presentation: 'card' }} />
          <Stack.Screen name="mini-apps/bmi" options={{ presentation: 'card' }} />
        </Stack>
        <ToastProvider />
        {commandPaletteOpen ? <CommandPalette /> : null}
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
