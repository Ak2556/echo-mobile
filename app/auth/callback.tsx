import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      // Session is set by lib/auth.ts signInWithGoogle after WebBrowser returns.
      // This screen is a fallback landing point; just check session and redirect.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
      } else {
        router.replace('/auth/login');
      }
    };
    void handleCallback();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#6366F1" size="large" />
    </View>
  );
}
