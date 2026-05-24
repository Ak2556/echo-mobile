import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';

/**
 * Initial route. Reads auth status from the central store and renders the
 * matching redirect. The status is owned by AuthListenerProvider (mounted in
 * _layout.tsx) — this screen never calls supabase.auth.getSession() directly.
 *
 * Safety net: if status stays 'checking' for >3s (e.g. corrupt AsyncStorage),
 * we fall through to /auth/login so the user is never stranded on a buffer.
 */
export default function Index() {
  const { status } = useAuth();
  const [bailed, setBailed] = useState(false);

  useEffect(() => {
    if (status !== 'checking') return;
    const t = setTimeout(() => setBailed(true), 3_000);
    return () => clearTimeout(t);
  }, [status]);

  if (status === 'checking' && !bailed) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366F1" size="large" />
      </View>
    );
  }

  if (status === 'ready') {
    return <Redirect href="/(tabs)/discover" />;
  }

  if (status === 'needs-onboarding') {
    return <Redirect href="/auth/signup-wizard" />;
  }

  // 'signed-out' (or bailed-from 'checking')
  return <Redirect href="/auth/login" />;
}
