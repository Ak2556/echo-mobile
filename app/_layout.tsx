import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Linking, View, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundaryProps } from 'expo-router';
import { ToastProvider } from '../components/ui/Toast';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import '../global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 0,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
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
  const { setUserId, setUsername, setDisplayName, setAvatarColor, setHasSeenOnboarding } = useAppStore();

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
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
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
            router.replace('/auth/setup-profile');
          }
        } else {
          router.replace('/(tabs)/discover');
        }
      } else if (event === 'SIGNED_OUT') {
        setUserId('');
        setUsername('');
        setDisplayName('');
        setHasSeenOnboarding(false);
        router.replace('/auth/login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1 }}>
        <AuthListener />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="thread/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="comments/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="user/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/index" options={{ presentation: 'card' }} />
          <Stack.Screen name="messages/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="followers" options={{ presentation: 'card' }} />
          <Stack.Screen name="bookmarks" options={{ presentation: 'card' }} />
          <Stack.Screen name="settings" options={{ presentation: 'card' }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'card' }} />
          <Stack.Screen name="report" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="blocked-users" options={{ presentation: 'card' }} />
          <Stack.Screen name="notification-prefs" options={{ presentation: 'card' }} />
          <Stack.Screen name="story" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="create-post" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="create-story" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="edit-post" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
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
      </View>
    </QueryClientProvider>
  );
}
