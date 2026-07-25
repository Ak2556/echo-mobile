import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
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
      // expo-notifications pulls in expo-modules-core / the Expo native runtime,
      // which can't load under vitest/node. App modules import it at load time,
      // so stub it; tests never assert on notification scheduling.
      'expo-notifications': path.resolve(__dirname, 'test/stubs/expo-notifications.ts'),
    },
  },
});
