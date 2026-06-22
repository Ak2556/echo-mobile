import { Stack } from 'expo-router';

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
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup-wizard" />
      <Stack.Screen name="email" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="callback" options={{ animation: 'none' }} />
    </Stack>
  );
}
