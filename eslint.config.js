import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  // Applies everywhere (no `files` restriction) so plain .js/.mjs tooling —
  // the root-level checker tests, scripts/ — keeps the same no-undef /
  // no-unused-vars coverage it had before the TS port; only the
  // TypeScript-specific rules below are scoped to .ts/.tsx.
  js.configs.recommended,
  // The app itself — src/ — is TypeScript now (see AGENTS.md). Everything
  // still under plain .js/.mjs is repo tooling (root-level checker tests,
  // scripts/) that was deliberately left out of the TS port.
  {
    extends: [...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test-setup.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Repo tooling that runs under Node, not in the browser: root-level
  // checker tests (nodeVersion.test.js and siblings) and scripts/. Plain
  // .js/.mjs, deliberately outside the TS port — see AGENTS.md.
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
)
