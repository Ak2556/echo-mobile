import { purgeLegacyMessageStore, registerQueryClient } from '../lib/core/localDataReset';
import { useEffect } from 'react';
import { Stack, useRouter, usePathname, useRootNavigationState } from 'expo-router';
import type { ErrorBoundaryProps, Href } from 'expo-router';
import { Appearance, AppState, Linking, LogBox, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../lib/ui/theme';
import { statusBarStyleFor } from '../lib/ui/appearance';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppErrorBoundary } from '../components/common/AppErrorBoundary';
import { track, initAnalytics } from '../lib/core/analytics';
import { recordAppOpen, noteNudgeOpened, ensureNudgesScheduled } from '../lib/ai/personalNudges';
import { pingDailyActivity } from '../lib/retention/retention';
import { cancelLegacyProactiveNudges } from '../lib/ai/proactiveNudges';
import { captureException, initMonitoring, wrapRoot } from '../lib/core/monitoring';
import { startOutbox } from '../lib/core/outboxProcessor';
import { drainMiniLink } from '../lib/minilink/drain';
import { getAnalyticsConsent } from '../lib/privacy/consent';
import { ConsentBanner } from '../components/ConsentBanner';
import { AgeConfirmGate } from '../components/onboarding/AgeConfirmGate';
import { AiConsentSheet } from '../components/ai/AiConsentSheet';
import { HealthConsentSheet } from '../components/consent/HealthConsentSheet';
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay';
import * as Notifications from 'expo-notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { QueryClient, MutationCache } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { mmkvPersister } from '../lib/core/queryPersister';
import { ToastProvider, showToast } from '../components/ui/Toast';
import { friendlyWriteError, isAuthSessionError } from '../lib/core/mutationErrors';
import { CommandPalette } from '../components/ai/CommandPalette';
import { useCommandPalette } from '../lib/ui/commandPalette';
import { AuthListenerProvider, useAuth, signOut } from '../lib/auth';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useAppStore } from '../store/useAppStore';
import { ServiceWorkerRegistrar } from '../components/pwa/ServiceWorkerRegistrar';
import DatabaseProvider from '@nozbe/watermelondb/DatabaseProvider';
import { database } from '../lib/database';
import { usePresenceTracking } from '../lib/social/presence';
import { persistGet, persistSet, persistDelete, storageHydrate } from '../store/persist';
import { parseEchoUniversalLink } from '../lib/routing/urlSafety';
import { handleNotificationReply } from '../lib/notifications/handleReplyResponse';
import { INBOX, inputFromPush, tapRouteOrInbox } from '../lib/notifications/tapTarget';
import { initNotificationSurface, registerPushAndStoreToken } from '../lib/notifications/push';
import { PomodoroRuntimeHost } from '../lib/mini-apps/pomodoroRuntime';
import { FloatingMiniApp } from '../components/mini-apps/FloatingMiniApp';
import { VoiceControl } from '../components/voice/VoiceControl';
import { NowReadingBar } from '../components/voice/NowReadingBar';
import { isPublicRoute } from '../lib/routing/publicRoutes';
import { refreshRemoteFlags } from '../lib/core/remoteFlags';
import { enableFreeze } from 'react-native-screens';
import '../global.css';

// Freeze off-screen screens (inactive tabs + background stack entries) so they
// stop re-rendering while hidden — keeps the foreground screen smoother.
enableFreeze(true);

LogBox.ignoreLogs(['[expo-notifications] Error reading persisted server registration info']);

// One-time migration: evict stale seeded data persisted before v2.
const DATA_VERSION = 2;
if (persistGet<number>('_dataVersion', 0) < DATA_VERSION) {
  ['notifications', 'conversations', 'messagesByConversation', 'stories'].forEach(persistDelete);
  persistSet('_dataVersion', DATA_VERSION);
}

// Cold-start timing — module-load happens before any React render.
const COLD_START_T0 = Date.now();

function isUnsignedSimulatorNotificationError(error: unknown): boolean {
  if (Platform.OS !== 'ios') return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Keychain access failed') && message.includes('entitlement');
}


// Intercept all fatal JS crashes to ensure the app stays alive for the user
if (typeof ErrorUtils !== 'undefined') {
  const defaultHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      // In production, swallow the crash and show a silent recovery toast
      if (!__DEV__) {
        console.warn('Recovered from fatal crash:', error);
        import('../components/ui/Toast').then(({ showToast }) => {
          showToast('Echo recovered from a hiccup', '🛡️');
        });
      } else if (defaultHandler) {
        // Let it redbox in development
        defaultHandler(error, isFatal);
      }
    }
  });
}

initMonitoring();
startOutbox(); // connectivity + replay any queued writes
void purgeLegacyMessageStore(); // once: DMs the retired local sync copied to disk
if (getAnalyticsConsent() === 'accepted') {
  initAnalytics();
}

const queryClient = new QueryClient({
  // Global write-failure handler: after retries are exhausted, surface a short
  // honest message. Flows with their own error UX (DM bubbles, comment compose)
  // opt out via `meta: { bespoke: true }`; anything can silence with meta.silent.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const meta = mutation.options.meta as { bespoke?: boolean; silent?: boolean } | undefined;
      // Invalid/expired session → recover by signing out; AuthGuard then routes
      // to login. Runs even for bespoke flows so the broken session is cleared.
      if (isAuthSessionError(error)) { void signOut(); }
      if (meta?.bespoke || meta?.silent) return;
      showToast(friendlyWriteError(error), '⚠️');
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 60 * 24,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // Default: NO auto-retry. A blind global retry would duplicate
      // non-idempotent inserts (DM/comment/publish) when the server wrote the
      // row but the ack was lost. Idempotent mutations (toggles) opt in to
      // retry individually; the offline outbox handles durable replay safely.
      retry: false,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 8000),
    },
  },
});

// So sign-out can clear it. The listener cannot import this file — it
// renders the listener — so the client registers itself here instead.
registerQueryClient(queryClient);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorBoundary {...props} />;
}

/**
 * Refresh this device's push token whenever a session becomes active.
 *
 * Expo push tokens rotate — on reinstall, on restore to a new device, and at
 * the OS's discretion. Nothing ran at launch to notice, so a rotated token left
 * the account pointing at an address that no longer resolved and notifications
 * simply stopped, with no error anywhere to say so.
 *
 * registerPushAndStoreToken only proceeds when permission is already granted,
 * so this can never surprise anyone with a permission dialog on startup.
 */
function AppearanceSync() {
  const appearance = useAppStore(s => s.appearance);
  useEffect(() => {
    // Pushes the choice to the native layer so the status bar, keyboard, alerts
    // and system pickers match the app. null hands control back to the device.
    try { Appearance.setColorScheme(appearance === 'system' ? null : appearance); } catch { /* unsupported (web) */ }
  }, [appearance]);
  return null;
}

// Follows the theme the app actually resolved (device, override and palette pair),
// not the raw device setting, so the icons stay readable against the screen behind them.
function ThemedStatusBar() {
  const { colors } = useTheme();
  return <StatusBar style={statusBarStyleFor(colors.isDark)} />;
}

function PushTokenRefresh() {
  const { status, session } = useAuth();
  const userId = session?.user?.id;
  useEffect(() => {
    // 'ready' is the only status with a usable session; 'needs-onboarding'
    // still has no profile row to hang a token off.
    if (Platform.OS === 'web' || status !== 'ready') return;
    void registerPushAndStoreToken(userId);
  }, [status, userId]);
  return null;
}

/**
 * Deliver mini-app facts left pending by a previous session.
 *
 * This used to run at module scope, where it could not work and could do harm.
 * On the AsyncStorage fallback path (Expo Go, or a build where MMKV didn't
 * link) the sync cache is still empty at module load and is seeded
 * asynchronously afterwards — so the drain read an empty queue and last
 * session's facts sat undelivered until the user happened to check off another
 * item. And it ran before the auth session was restored, so the expenses pull
 * came back empty and the save pushed the un-merged local doc to remote: a
 * silent last-write-wins clobber of another device's expenses, with no user
 * action behind it.
 *
 * Gated on 'ready' for the same reason as PushTokenRefresh above — it is the
 * only status with a usable session. storageHydrate() is a no-op under MMKV
 * and idempotent otherwise, so awaiting it here just guarantees the queue is
 * readable before we look at it.
 */
function MiniLinkDrain() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    void storageHydrate().then(() => {
      if (cancelled) return;
      return drainMiniLink();
    });
    return () => { cancelled = true; };
  }, [status]);
  return null;
}

/**
 * Route to the chooser whenever another app shares something to Echo.
 *
 * The payload survives until it is reset, so this fires on a cold start (the
 * app was launched by the share) and on a warm one (it was already running)
 * without either case needing its own path.
 */
function ShareIntentRouter() {
  const router = useRouter();
  const { hasShareIntent } = useShareIntentContext();
  // Same ordering hazard as AuthGuard: a share-launched cold start can deliver
  // the intent before <Stack> has mounted. See the comment there.
  const navKey = useRootNavigationState()?.key;
  useEffect(() => {
    if (!navKey) return;
    if (hasShareIntent) router.push('/share-intent');
  }, [navKey, hasShareIntent, router]);
  return null;
}

// Live auth guard: if the session clears mid-session (e.g. refresh token revoked
// or expired), route to login instead of stranding the user on a now-broken
// authenticated screen. index.tsx only guards cold start.
function AuthGuard() {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // This component is a sibling rendered BEFORE <Stack>, so its effect fires
  // before the navigator registers. Navigating then throws "Attempted to
  // navigate before mounting the Root Layout component" and drops the user on
  // the error screen. Usually invisible because status starts as 'checking',
  // but a cold start that resolves to signed-out before <Stack> mounts — a
  // notification tap, for instance — loses the race.
  const navKey = useRootNavigationState()?.key;
  useEffect(() => {
    if (!navKey) return;
    if (status !== 'signed-out') return;
    if (isPublicRoute(pathname)) return;
    router.replace('/auth/login');
  }, [navKey, status, pathname, router]);
  return null;
}

/**
 * Universal-link router. Listens for inbound deep links that match the
 * downloadecho.com domain and pushes to the right in-app route. Auth callbacks
 * (echo://auth/callback?code=…) are handled by AuthListenerProvider, NOT
 * here — keeping the two responsibilities cleanly split.
 */
function UniversalLinkRouter(): null {
  const router = useRouter();
  // Same ordering hazard as AuthGuard: getInitialURL resolves on a
  // link-launched cold start, which can beat <Stack> mounting.
  const navKey = useRootNavigationState()?.key;
  useEffect(() => {
    if (!navKey) return;
    const handle = (url: string) => {
      const route = parseEchoUniversalLink(url);
      if (!route) return;
      if (route.kind === 'echo') router.push({ pathname: '/thread/[id]', params: { id: route.id } });
      else if (route.kind === 'user') router.push({ pathname: '/user/[id]', params: { id: route.id } });
      else if (route.kind === 'comment') router.push({ pathname: '/comments/[id]', params: { id: route.id } });
    };
    Linking.getInitialURL().then(url => { if (url) handle(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [navKey, router]);
  return null;
}

// A push tap that arrived before the person was signed in, held until they are.
let pendingPushTap: Record<string, unknown> | null = null;
// The last tap this process opened, so a re-run of the effect cannot open it again.
let lastHandledPushTap: string | null = null;

function RootLayout() {
  const userId = useAppStore(s => s.userId);
  usePresenceTracking(userId ?? undefined);
  const commandPaletteOpen = useCommandPalette(s => s.isOpen);
  const router = useRouter();

  // Native builds embed these fonts (expo-font plugin in app.json), so they
  // exist before the first frame. This load is for web. On Android it used to
  // be the only source: text laid out at startup was measured with the system
  // font, then drawn in wider Inter once it arrived, which cut off the last
  // letter of the tab labels, the consent banner and Flow's tabs.
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
  });

  // One app_open per cold start. Also feeds the on-device engagement model
  // (learns *when* this user is active) that drives personalized nudge timing.
  useEffect(() => {
    const coldMs = Date.now() - COLD_START_T0;
    track('app_open', { cold_ms: coldMs });
    // Settles up for nudges that fired while the app was closed, then records
    // the open. Without the first half the fatigue model could only ever be
    // reset, never incremented, so back-off never engaged.
    recordAppOpen();
    // The daily streak used to be counted only by the home feed, so opening
    // Echo from a notification — a DM, a comment, the assist gesture — never
    // counted toward it. Notification opens are precisely the path the
    // retention loop exists to create, so the streak has to be counted here.
    pingDailyActivity();
    // Retire the old fixed-slot check-ins in favor of personalized nudges.
    void cancelLegacyProactiveNudges();
    // Scheduling used to live on the chat tab alone, so anyone who never opened
    // that tab was never scheduled anything. The chat tab still reschedules
    // with richer signals; this only guarantees a plan exists.
    void ensureNudgesScheduled(useAppStore.getState().proactiveAiEnabled);
  }, []);

  // Remote feature flags — the kill switch. Fetched on launch and again when
  // the app comes back to the foreground, so switching a feature off reaches
  // users within one resume instead of one release.
  //
  // A failure here is deliberately silent: refreshRemoteFlags keeps the last
  // known values, and the compiled defaults in lib/core/featureFlags.ts sit under
  // those, so the worst case is the app behaving exactly as it shipped.
  useEffect(() => {
    // Throttled so this never becomes a round trip on every resume — someone
    // checking a notification twenty times an hour is on a metered connection.
    const MIN_GAP_MS = 5 * 60 * 1000;
    let lastAt = 0;
    const refresh = () => {
      if (Date.now() - lastAt < MIN_GAP_MS) return;
      lastAt = Date.now();
      void refreshRemoteFlags();
    };
    refresh();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, []);

  // Channels and reply actions, registered before any notification can land.
  // A category is matched by id at delivery time, so this cannot wait for the
  // permission prompt or the Reply button never appears on the first push.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void initNotificationSurface();
  }, []);

  // Push notification taps.
  //
  // Two things have to be true before a tap can open anything: <Stack> exists, and
  // the person is signed in with a profile. The effect used to run at mount, so a
  // cold start from a tap, which is exactly when the response is waiting, pushed
  // before the navigator existed ("Attempted to navigate before mounting the Root
  // Layout component") and landed on the default screen as if they had opened the
  // app themselves. And while auth was still resolving, app/index.tsx's redirect
  // to the home tab could overtake the push.
  //
  // A tap that arrives earlier is held and opened the moment auth is ready, which
  // also covers someone who has to sign in or finish onboarding first.
  const pushNavKey = useRootNavigationState()?.key;
  const { status: authStatus } = useAuth();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!pushNavKey) return;

    let cancelled = false;
    const open = (data: Record<string, unknown> | null | undefined) => {
      const input = inputFromPush(data);
      if (!input) return;
      if (input.kind === 'personal_nudge') {
        // The tap is our on-device "opened" signal: it resets nudge back-off.
        noteNudgeOpened();
      }
      const target = tapRouteOrInbox(input);
      // routed:false means the push named a kind or id with no screen of its own and
      // the person went to the inbox instead. Worth knowing when it climbs.
      track('notification_tapped', { kind: input.kind, routed: target !== INBOX });
      router.push(target as Href);
    };

    if (authStatus === 'ready' && pendingPushTap) {
      const held = pendingPushTap;
      pendingPushTap = null;
      open(held);
    }

    // A reply typed in the shade is not a tap: it must send, not just navigate.
    // Both entry points go through the same check — a cold start caused by
    // tapping Send is the case that matters most, because the reply only exists
    // in this response object.
    const handle = (response: Notifications.NotificationResponse, initial: boolean) => {
      // getLastNotificationResponseAsync keeps returning the same response, and this
      // effect re-runs when auth changes: never open one tap twice.
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (initial && key === lastHandledPushTap) return;
      lastHandledPushTap = key;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (handleNotificationReply(response.actionIdentifier, response.userText, data)) return;
      if (authStatus === 'ready') open(data);
      else pendingPushTap = data;
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) return;
        handle(response, true);
      })
      .catch((error) => {
        if (!isUnsignedSimulatorNotificationError(error)) {
          captureException(error, { tags: { source: 'notification_bootstrap' } });
        }
      });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => handle(response, false));

    return () => {
      cancelled = true;
      sub.remove();
    };
    // `router` is stable; the handlers read only their arguments and the auth status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushNavKey, authStatus]);

  return (
    // Outermost: ShareIntentRouter reads this context, and a share can be what
    // launched the process, so the provider has to exist before anything else
    // mounts.
    <ShareIntentProvider options={{ resetOnBackground: false }}>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: mmkvPersister, maxAge: 1000 * 60 * 60 * 24 * 7 }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthListenerProvider />
        <AuthGuard />
        {/* Web-only; a no-op on native. Mounted here so the worker registers
            wherever the user lands, not only on the home route. */}
        <ServiceWorkerRegistrar />
        <AppearanceSync />
        <ThemedStatusBar />
        <PushTokenRefresh />
        <MiniLinkDrain />
        <ShareIntentRouter />
        <UniversalLinkRouter />
        <PomodoroRuntimeHost />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="target-progress" options={{ presentation: 'card' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="thread/[id]" options={{ presentation: 'card', animation: 'fade_from_bottom', animationDuration: 240 }} />
          <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="share-intent" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="comments/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="user/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/index" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="group/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="followers" options={{ presentation: 'card' }} />
          <Stack.Screen name="bookmarks" options={{ presentation: 'card' }} />
          <Stack.Screen name="settings" options={{ presentation: 'card' }} />
          <Stack.Screen name="ai-memory" options={{ presentation: 'card' }} />
          <Stack.Screen name="thinking-partners" options={{ presentation: 'card' }} />
          <Stack.Screen name="daily-question" options={{ presentation: 'card', animation: 'fade_from_bottom', animationDuration: 240 }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'card' }} />
          <Stack.Screen name="report" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="blocked-users" options={{ presentation: 'card' }} />
          <Stack.Screen name="notification-prefs" options={{ presentation: 'card' }} />
          <Stack.Screen name="delete-account" options={{ presentation: 'card' }} />
          <Stack.Screen name="story" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="create-post" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="create-story" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="edit-post" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="mini-apps" options={{ presentation: 'card' }} />
          <Stack.Screen name="salons" options={{ presentation: 'card' }} />
          <Stack.Screen name="salon/[slug]" options={{ presentation: 'card' }} />
          <Stack.Screen name="office-hours" options={{ presentation: 'card' }} />
          <Stack.Screen name="office-hours/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="badges" options={{ presentation: 'card' }} />
          <Stack.Screen name="quests" options={{ presentation: 'card' }} />
          <Stack.Screen name="year-in-echo" options={{ presentation: 'card' }} />
          <Stack.Screen name="e/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="evolution/[rootId]" options={{ presentation: 'card' }} />
          <Stack.Screen name="remix/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="muted-users" options={{ presentation: 'card' }} />
          <Stack.Screen name="persona" options={{ presentation: 'card' }} />
          <Stack.Screen name="my-reports" options={{ presentation: 'card' }} />
          <Stack.Screen name="create-salon" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="create-office-hour" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="create-listing" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="listing/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="appeal" options={{ presentation: 'card' }} />
        </Stack>
        <FloatingMiniApp />
        <VoiceControl />
        <NowReadingBar />
        <TutorialOverlay />
        <ToastProvider />
        <ConsentBanner />
        {/* One-time birthday card for accounts created before the age step. */}
        <AgeConfirmGate />
        <AiConsentSheet />
        <HealthConsentSheet />
        {commandPaletteOpen ? <CommandPalette /> : null}
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
    </ShareIntentProvider>
  );
}

export default wrapRoot(RootLayout);
