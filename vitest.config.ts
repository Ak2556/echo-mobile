import { defineConfig } from 'vitest/config';
import path from 'path';

// React Native's global. Expo modules read it at import time, so anything
// pulling expo-secure-store or expo-crypto fails to load without it.
const define = { __DEV__: true };

const alias = {
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
  // Reanimated 4 loads react-native-worklets at import time, which reaches for
  // the native TurboModule registry and throws under jsdom. 95 files import it,
  // so component tests cannot mount anything real without this.
  'react-native-reanimated': path.resolve(__dirname, 'test/stubs/react-native-reanimated.ts'),
  // expo-blur ships JSX inside a .js build file, which Vite will not parse.
  'expo-blur': path.resolve(__dirname, 'test/stubs/expo-blur.ts'),
  'expo-linear-gradient': path.resolve(__dirname, 'test/stubs/expo-linear-gradient.ts'),
};

const exclude = [
  '**/node_modules/**',
  '**/dist/**',
  '.claude/**',
  '.claire/**',
  '.codex/**',
  '.qodo/**',
];

/**
 * Two projects, because they need different environments.
 *
 * `logic` is the suite as it has always been: plain node, `.test.ts` only.
 * `ui` is new. Component tests need a DOM, and since `react-native` is already
 * aliased to `react-native-web` here, rendering into jsdom with
 * @testing-library/react is the shortest honest path — no react-test-renderer,
 * which React 19 has deprecated.
 *
 * `.test.tsx` was previously excluded by the include glob, so component tests
 * were structurally impossible to write. That is why there were none.
 */
export default defineConfig({
  define,
  resolve: { alias },
  test: {
    passWithNoTests: true,
    projects: [
      {
        define,
        resolve: { alias },
        test: {
          name: 'logic',
          environment: 'node',
          globals: true,
          include: ['**/*.test.ts'],
          exclude,
        },
      },
      {
        define,
        resolve: { alias },
        // JSX is handled by oxc, which Vitest 4 uses in place of esbuild. Setting
        // esbuild.jsx here is ignored and only produces a warning.
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          include: ['**/*.test.tsx'],
          exclude,
          setupFiles: [path.resolve(__dirname, 'test/setup-ui.ts')],
        },
      },
    ],
  },
});
