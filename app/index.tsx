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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    });
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
