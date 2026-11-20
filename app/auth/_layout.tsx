import { Stack } from 'expo-router';
import { remountOnLanguageChange } from '../../lib/i18n/languageScope';

// signup-wizard has its own language picker and holds the form in local state,
// so a remount on a language switch would wipe what the user typed. It stays
// mounted and takes its strings from useI18n().tt, which re-renders.
const KEEP_MOUNTED = new Set(['signup-wizard']);
const SCREEN_LAYOUT = remountOnLanguageChange(KEEP_MOUNTED);

/**
 * Auth group layout. No redirector here — the central AuthListenerProvider
 * (mounted in app/_layout.tsx) is the single source of truth for auth state,
 * and app/index.tsx handles redirects based on that state.
 *
 * Each screen below decides for itself whether to navigate forward when the
 * status changes (e.g. login.tsx watches useAuth() and pushes to /signup-wizard
 * or /(tabs)/discover when status transitions).
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }} screenLayout={SCREEN_LAYOUT}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup-wizard" />
      <Stack.Screen name="email" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="callback" options={{ animation: 'none' }} />
    </Stack>
  );
}
