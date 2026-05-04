import { useEffect } from 'react';
import { Stack, useRouter , ErrorBoundaryProps } from 'expo-router';
import { Linking, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { CommandPalette } from '../components/ai/CommandPalette';
import { supabase } from '../lib/supabase';
import { useCommandPalette } from '../lib/commandPalette';
import { useAppStore } from '../store/useAppStore';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { fetchRemoteBlocks, fetchRemoteMutes } from '../lib/supabaseEchoApi';
import '../global.css';

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

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center bg-black p-4">
      <Text className="text-red-500 font-bold mb-2">Something went wrong</Text>
      <Text className="text-white mb-4 text-center">{error.message}</Text>
      <Text className="text-blue-400 font-semibold" onPress={retry}>Try Again</Text>
    </View>
  );
}

function AuthListener() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setUserId, setUsername, setDisplayName, setAvatarColor, setHasSeenOnboarding, resetSocialData, clearChatHistory } = useAppStore();

  // Exchange token from deep-link URL (email confirmation / OAuth callback)
  const handleDeepLink = async (url: string) => {
    if (!url.includes('echo://')) return;
    // Extract the fragment/query that Supabase appends
    const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
    const params = Object.fromEntries(
      fragment.split('&').map(p => p.split('=').map(decodeURIComponent))
    );
    if (params.access_token && params.refresh_token) {
      await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      // onAuthStateChange below will handle the redirect
    }
  };

  useEffect(() => {
    // Handle cold-start deep link
    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url); });
    // Handle deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [router, setAvatarColor, setDisplayName, setHasSeenOnboarding, setUserId, setUsername]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        setUserId(session.user.id);
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
