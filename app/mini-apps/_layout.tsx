import { Stack } from 'expo-router';

export default function MiniAppsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'card' }} />
  );
}
