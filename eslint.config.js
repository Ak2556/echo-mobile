// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.claude/**', '.claire/**', '.codex/**', '.qodo/**'],
  },
  {
    files: ['src/features/**/*.ts', 'src/features/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['src/features/*/*/**', '!./**', '!../**'],
              message: 'Feature-Sliced Design (FSD) violation: A feature cannot import deep internals of another feature. Import from the public index instead.',
            },
            {
              group: ['@/features/*/*/**'],
              message: 'Feature-Sliced Design (FSD) violation: A feature cannot import deep internals of another feature. Import from the public index instead.',
            }
          ]
        }
      ]
    }
  }
]);
