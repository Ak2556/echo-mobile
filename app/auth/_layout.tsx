import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="confirm-email" />
      <Stack.Screen name="setup-profile" />
      <Stack.Screen name="signup-wizard" />
      <Stack.Screen name="callback" />
      <Stack.Screen name="verify-phone" />
    </Stack>
  );
}
