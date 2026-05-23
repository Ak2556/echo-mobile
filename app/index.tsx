import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const username = useAppStore(s => s.username);

  useEffect(() => {
    // Safety net — if getSession() doesn't resolve in 3s (e.g. a corrupt
    // AsyncStorage entry, a Supabase init hang), we fall through assuming
    // no session and let /auth/login take over.
    const bail = setTimeout(() => setChecking(false), 3_000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(bail);
      setHasSession(!!session);
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(bail);
      setHasSession(!!session);
      setChecking(false);
    });

    return () => {
      clearTimeout(bail);
      subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366F1" size="large" />
      </View>
    );
  }

  if (!hasSession) {
    return <Redirect href="/auth/login" />;
  }

  if (!username) {
    return <Redirect href="/auth/signup-wizard" />;
  }

  return <Redirect href="/(tabs)/discover" />;
}
