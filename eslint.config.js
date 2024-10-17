import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';

/** @type {Linter.FlatConfig[]} */
const config = [
  {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    files: ['**/*.ts'], // Apply configuration only to TypeScript files
    rules: {
      'arrow-body-style': ['error', 'as-needed'],
      'prefer-arrow-callback': 'error',
      'implicit-arrow-linebreak': ['error', 'beside'],
      'no-confusing-arrow': ['error', { allowParens: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];

export default config;
