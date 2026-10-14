/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.wrangler/',
    '.turbo/',
    'coverage/',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
  ],
  overrides: [
    {
      files: ['**/*.{tsx,jsx}'],
      plugins: ['braun'],
      rules: {
        'braun/no-slop-ui': 'error',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
