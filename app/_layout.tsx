import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppErrorBoundary } from '../components/common/AppErrorBoundary';
import { track, initAnalytics } from '../lib/analytics';
import { initMonitoring, wrapRoot } from '../lib/monitoring';
import { getAnalyticsConsent } from '../lib/consent';
import { ConsentBanner } from '../components/ConsentBanner';
import * as Notifications from 'expo-notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { CommandPalette } from '../components/ai/CommandPalette';
import { useCommandPalette } from '../lib/commandPalette';
import { AuthListenerProvider } from '../lib/auth';
import { persistGet, persistSet, persistDelete } from '../store/persist';
import '../global.css';

// One-time migration: evict stale seed/mock data persisted before v2.
const DATA_VERSION = 2;
if (persistGet<number>('_dataVersion', 0) < DATA_VERSION) {
  ['notifications', 'conversations', 'messagesByConversation', 'stories'].forEach(persistDelete);
  persistSet('_dataVersion', DATA_VERSION);
}

// Cold-start timing — module-load happens before any React render.
const COLD_START_T0 = Date.now();

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
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'echo.app' && parsed.hostname !== 'www.echo.app') return;
        const [, prefix, id] = parsed.pathname.split('/');
        if (!id) return;
        if (prefix === 'e') router.push(`/thread/${id}` as any);
        else if (prefix === 'u') router.push(`/user/${id}` as any);
        else if (prefix === 'c') router.push(`/comments/${id}` as any);
      } catch { /* malformed URL — ignore */ }
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
  });

  // One app_open per cold start.
  useEffect(() => {
    const coldMs = Date.now() - COLD_START_T0;
    track('app_open', { cold_ms: coldMs });
  }, []);

  // Push notification taps.
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

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      route(response.notification.request.content.data as Record<string, unknown>);
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
          <Stack.Screen name="upgrade" options={{ presentation: 'modal', animation: 'fade' }} />
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
        <ConsentBanner />
        {commandPaletteOpen ? <CommandPalette /> : null}
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default wrapRoot(RootLayout);
