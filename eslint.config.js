import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Harte Regeln 1 und 2: Simulation ist deterministisch und DOM-frei.
    files: ['src/sim/**/*.ts', 'src/ai/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/render/**', '**/ui/**', '../render', '../ui'] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Nur den seedbaren RNG verwenden.' },
        { object: 'Date', property: 'now', message: 'Keine Echtzeit in der Simulation.' },
        { object: 'performance', property: 'now', message: 'Keine Echtzeit in der Simulation.' },
      ],
    },
  },
);
