import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

// https://sveltejs.github.io/eslint-plugin-svelte/user-guide/#typescript-project
export default defineConfig(
  globalIgnores([
    '.agents/**',
    '.claude/**',
    '.codex/**',
    'node_modules/**',
    'dist/**',
    'local/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['**/*.{js,ts,svelte}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.ts', '**/*.svelte'],
    extends: [ts.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.tools.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  svelte.configs.recommended,
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
);
