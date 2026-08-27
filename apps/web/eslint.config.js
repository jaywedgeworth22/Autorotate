import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // Vendored shadcn/ui primitives and the hook that ships with them. These
    // are generated files kept close to upstream so they can be regenerated;
    // they carry pre-existing react-refresh/only-export-components,
    // set-state-in-effect and purity violations that are upstream's shape,
    // not this codebase's. Excluding them is what lets `npm run lint` gate CI
    // (AR-15) instead of being skipped entirely. Hand-written components under
    // src/components/** are still linted.
    'src/components/ui/**',
    'src/hooks/use-mobile.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Server code runs in Node, not a browser, and exports no components.
    files: ['api/**/*.ts', 'db/**/*.ts', 'contracts/**/*.ts', '*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
