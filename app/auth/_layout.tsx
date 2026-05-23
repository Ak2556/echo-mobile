import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

function AuthSessionRedirector() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    setUserId,
    setUsername,
    setDisplayName,
    setBio,
    setAvatarColor,
    setAvatarUrl,
    setHasSeenOnboarding,
  } = useAppStore();

  useEffect(() => {
    let cancelled = false;

    const redirectForSession = async (session: Session | null) => {
      // Password recovery intentionally lands on an auth route with a temporary
      // session so the user can update their password before entering the app.
      if (pathname === '/auth/reset-password') return;
      if (cancelled || !session) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, bio, avatar_color, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;

      setUserId(session.user.id);

      if (profile?.username) {
        setUsername(profile.username);
        setDisplayName(profile.display_name ?? '');
        setBio(profile.bio ?? '');
        setAvatarColor(profile.avatar_color ?? '#6366F1');
        setAvatarUrl(profile.avatar_url ?? '');
        setHasSeenOnboarding(true);
        router.replace('/(tabs)/discover');
        return;
      }

      setUsername('');
      setDisplayName('');
      setBio('');
      setAvatarUrl('');
      setHasSeenOnboarding(false);
      if (pathname !== '/auth/signup-wizard') {
        router.replace('/auth/signup-wizard');
      }
    };

    const redirectIfSignedIn = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await redirectForSession(session);
    };

    void redirectIfSignedIn();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        void redirectForSession(session);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [
    pathname,
    router,
    setAvatarColor,
    setAvatarUrl,
    setBio,
    setDisplayName,
    setHasSeenOnboarding,
    setUserId,
    setUsername,
  ]);

  return null;
}

export default function AuthLayout() {
  return (
    <>
      <AuthSessionRedirector />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="confirm-email" />
        <Stack.Screen name="setup-profile" />
        <Stack.Screen name="signup-wizard" />
        <Stack.Screen name="callback" />
        <Stack.Screen name="verify-phone" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </>
  );
}
