import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundaryProps } from 'expo-router';
import { View, Text } from 'react-native';
import '../global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    },
  },
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center bg-black p-4">
      <Text className="text-red-500 font-bold mb-2">Something went wrong</Text>
      <Text className="text-white mb-4 text-center">{error.message}</Text>
      <Text className="text-blue-400 font-semibold" onPress={retry}>Try Again</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="thread/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </QueryClientProvider>
  );
}
