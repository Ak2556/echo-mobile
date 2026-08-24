import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // React Native's global. Expo modules read it at import time, so anything
  // pulling expo-secure-store or expo-crypto fails to load without it.
  define: { __DEV__: true },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', '.claire/**', '.codex/**', '.qodo/**'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'react-native': 'react-native-web',
      // expo-notifications pulls in expo-modules-core / the Expo native runtime,
      // which can't load under vitest/node. App modules import it at load time,
      // so stub it; tests never assert on notification scheduling.
      'expo-notifications': path.resolve(__dirname, 'test/stubs/expo-notifications.ts'),
      'expo-haptics': path.resolve(__dirname, 'test/stubs/expo-haptics.ts'),
      // Same reason: lib/secureSessionStorage imports both at module load, so
      // every test that reaches lib/supabase would fail on the native runtime.
      'expo-secure-store': path.resolve(__dirname, 'test/stubs/expo-secure-store.ts'),
      'expo-crypto': path.resolve(__dirname, 'test/stubs/expo-crypto.ts'),
    },
  },
});
