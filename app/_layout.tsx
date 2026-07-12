import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { Linking, LogBox, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppErrorBoundary } from '../components/common/AppErrorBoundary';
import { track, initAnalytics } from '../lib/analytics';
import { captureException, initMonitoring, wrapRoot } from '../lib/monitoring';
import { getAnalyticsConsent } from '../lib/consent';
import { ConsentBanner } from '../components/ConsentBanner';
import * as Notifications from 'expo-notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { CommandPalette } from '../components/ai/CommandPalette';
import { useCommandPalette } from '../lib/commandPalette';
import { AuthListenerProvider } from '../lib/auth';
import { persistGet, persistSet, persistDelete } from '../store/persist';
import { parseEchoUniversalLink, safeRouteId } from '../lib/urlSafety';
import '../global.css';

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

initMonitoring();
if (getAnalyticsConsent() === 'accepted') {
  initAnalytics();
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

/**
 * Universal-link router. Listens for inbound deep links that match the
 * echo.app domain and pushes to the right in-app route. Auth callbacks
 * (echo://auth/callback?code=…) are handled by AuthListenerProvider, NOT
 * here — keeping the two responsibilities cleanly split.
 */
function UniversalLinkRouter(): null {
  const router = useRouter();
  useEffect(() => {
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
  }, [router]);
  return null;
}

function RootLayout() {
  const commandPaletteOpen = useCommandPalette(s => s.isOpen);
  const router = useRouter();

  // Load Inter in the background. System font is the fallback while loading;
  // swap-in flicker is briefer than any splash gate.
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

  // One app_open per cold start.
  useEffect(() => {
    const coldMs = Date.now() - COLD_START_T0;
    track('app_open', { cold_ms: coldMs });
  }, []);

  // Push notification taps.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;
    const VALID_KINDS = new Set(['daily_question', 'follow', 'like', 'comment', 'reaction', 'mention', 'repost', 'bookmark', 'quote', 'dm', 'appeal_resolved']);
    const route = (data: Record<string, unknown> | null | undefined) => {
      if (!data) return;
      const kind = String(data.kind ?? '');
      if (!VALID_KINDS.has(kind)) return;
      const targetId = String(data.target_id ?? data.echo_id ?? data.user_id ?? '');
      const routeId = safeRouteId(targetId);
      if (kind === 'daily_question') {
        track('notification_tapped', { kind });
        router.push('/daily-question');
        return;
      }
      if (!routeId) return;
      track('notification_tapped', { kind });
      if (kind === 'follow') router.push({ pathname: '/user/[id]', params: { id: routeId } });
      else if (kind === 'comment' || kind === 'reaction' || kind === 'like' || kind === 'quote' || kind === 'mention' || kind === 'repost' || kind === 'bookmark') {
        router.push({ pathname: '/thread/[id]', params: { id: routeId } });
      } else if (kind === 'dm') {
        router.push({ pathname: '/messages/[id]', params: { id: routeId } });
      } else if (kind === 'appeal_resolved') {
        router.push('/appeal');
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) return;
        route(response.notification.request.content.data as Record<string, unknown>);
      })
      .catch((error) => {
        if (!isUnsignedSimulatorNotificationError(error)) {
          captureException(error, { tags: { source: 'notification_bootstrap' } });
        }
      });

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
        <AuthListenerProvider />
        <UniversalLinkRouter />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="target-progress" options={{ presentation: 'card' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="thread/[id]" options={{ presentation: 'card', animation: 'fade_from_bottom', animationDuration: 240 }} />
          <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="comments/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="user/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/index" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/[id]" options={{ presentation: 'card' }} />
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
          <Stack.Screen name="upgrade" options={{ presentation: 'modal', animation: 'fade' }} />
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
        <ToastProvider />
        <ConsentBanner />
        {commandPaletteOpen ? <CommandPalette /> : null}
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default wrapRoot(RootLayout);
