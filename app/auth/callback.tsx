import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { consumeAuthCallbackUrl, hasAuthCallbackPayload, parseAuthCallbackUrl } from '../../lib/authCallback';
import { showToast } from '../../components/ui/Toast';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    let cancelled = false;
    const handleCallback = async () => {
      const callbackUrl = url ?? (await Linking.getInitialURL());
      if (cancelled) return;

      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (existingSession) {
        const type = callbackUrl ? parseAuthCallbackUrl(callbackUrl).type : null;
        router.replace(type === 'recovery' ? '/auth/reset-password' : '/');
        return;
      }

      if (callbackUrl && hasAuthCallbackPayload(callbackUrl)) {
        const result = await consumeAuthCallbackUrl(callbackUrl);
        if (cancelled) return;
        if (result.status === 'error') {
          showToast(result.error, '❌');
          router.replace('/auth/login');
          return;
        }
        if (result.status === 'success') {
          router.replace(result.type === 'recovery' ? '/auth/reset-password' : '/');
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        router.replace('/');
      } else {
        router.replace('/auth/login');
      }
    };
    void handleCallback();
    return () => { cancelled = true; };
  }, [router, url]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#6366F1" size="large" />
    </View>
  );
}
