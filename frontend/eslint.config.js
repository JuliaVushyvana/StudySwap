// ESLint для фронтенду. Запуск: npm run lint
// Сторінки підключають звичайні <script> (не модулі), тож sourceType: 'script' і глобальні об'єкти браузера.
// Рекомендовані правила беремо з самого ESLint, тож потрібна лише одна залежність — eslint.

const { builtinRules } = require('eslint/use-at-your-own-risk');

const recommended = Object.fromEntries(
  [...builtinRules].filter(([, rule]) => rule.meta?.docs?.recommended).map(([name]) => [name, 'error']),
);

const readonly = (names) => Object.fromEntries(names.map((name) => [name, 'readonly']));

const BROWSER_GLOBALS = readonly([
  'window', 'document', 'location', 'history', 'navigator', 'localStorage', 'sessionStorage', 'console',
  'fetch', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData',
  'DataTransfer', 'DOMParser', 'Event', 'MouseEvent', 'CustomEvent', 'Node', 'HTMLElement', 'AbortController',
  'TextEncoder', 'TextDecoder', 'crypto', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'globalThis',
  'module', // lib/http.js експортує себе і для Node-тестів: typeof module !== 'undefined' && module.exports
]);

const NODE_GLOBALS = readonly([
  'require', 'module', 'exports', '__dirname', '__filename', 'process', 'console', 'Buffer', 'globalThis',
  'setTimeout', 'clearTimeout', 'URL', 'TextEncoder', 'fetch',
]);

const RULES = {
  ...recommended,
  // `_` на початку назви = «навмисно не використовується»; { field, ...rest } — звичний спосіб прибрати поле
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  eqeqeq: ['error', 'always'],
  'prefer-const': 'error',
  'no-var': 'error',
};

module.exports = [
  // vendor/ — сторонні бібліотеки (JSZip), dist/ — результат збірки
  { ignores: ['node_modules/', 'dist/', 'vendor/', 'coverage/'] },
  {
    files: ['*.js', 'lib/**/*.js'],
    ignores: ['eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: BROWSER_GLOBALS },
    rules: RULES,
  },
  {
    files: ['eslint.config.js', 'scripts/**/*.js', 'test/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: NODE_GLOBALS },
    rules: RULES,
  },
];
