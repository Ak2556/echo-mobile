import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { consumeAuthCallbackUrl } from '../../lib/auth/callback';
import { useTheme } from '../../lib/theme';
import { captureException } from '../../lib/monitoring';

/**
 * Handles echo://auth/callback#access_token=…&refresh_token=…
 * (magic-link / OAuth redirect) when the URL arrives as a deep link
 * and Expo Router navigates here instead of leaving the user on the
 * "Unmatched Route" 404 screen.
 *
 * Auth processing:
 *   consumeAuthCallbackUrl → supabase.auth.setSession
 *   → onAuthStateChange (SIGNED_IN) in AuthListenerProvider
 *   → hydrateFromSession → routeFor → router.replace('/(tabs)/home')
 *
 * On error we fall back to login so the user is never stranded.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const url = Linking.useURL();

  useEffect(() => {
    if (!url) return;

    consumeAuthCallbackUrl(url)
      .then(result => {
        if (result.status === 'error') {
          captureException(new Error(`auth/callback: ${result.error}`), {
            tags: { source: 'auth_callback_screen' },
          });
          router.replace('/auth/login');
        }
        // success path: AuthListenerProvider's onAuthStateChange fires,
        // hydrateFromSession runs, routeFor redirects to /(tabs)/home.
      })
      .catch(err => {
        captureException(err, { tags: { source: 'auth_callback_screen' } });
        router.replace('/auth/login');
      });
  }, [url]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
