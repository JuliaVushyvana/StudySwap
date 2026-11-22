// ESLint для бекенду (Node.js, CommonJS). Запуск: npm run lint
// Рекомендовані правила беремо з самого ESLint (позначка docs.recommended у вбудованих правилах),
// тож потрібна лише одна залежність — eslint.

const { builtinRules } = require('eslint/use-at-your-own-risk');

const recommended = Object.fromEntries(
  [...builtinRules].filter(([, rule]) => rule.meta?.docs?.recommended).map(([name]) => [name, 'error']),
);

const NODE_GLOBALS = Object.fromEntries([
  'require', 'module', 'exports', '__dirname', '__filename', 'process', 'console', 'Buffer',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'fetch', 'structuredClone',
].map((name) => [name, 'readonly']));

module.exports = [
  { ignores: ['node_modules/', 'coverage/', 'uploads/'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: NODE_GLOBALS,
    },
    rules: {
      ...recommended,
      // Невикористані змінні — помилка; `_` на початку назви = «навмисно не використовується»,
      // а { field, ...rest } — звичний спосіб прибрати поле з об'єкта
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
