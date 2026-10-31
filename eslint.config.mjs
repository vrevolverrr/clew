// Mirrors the community plugin scanner (eslint-plugin-obsidianmd docs/configuration.md, "Community plugin
// scanner configuration"): its security rules are errors that block a submission; it leaves the rest as advice.
import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

const warn = (setting) => (Array.isArray(setting) ? ['warn', ...setting.slice(1)] : setting === 'off' || setting === 0 ? setting : 'warn');
const advisory = obsidianmd.configs.recommended.map((config) =>
  config.rules ? { ...config, rules: Object.fromEntries(Object.entries(config.rules).map(([rule, setting]) => [rule, warn(setting)])) } : config,
);

export default defineConfig([
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.*', 'manifest.json'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...advisory,
  {
    files: ['**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}'],
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'obsidianmd/regex-lookbehind': 'error',
      'obsidianmd/no-forbidden-elements': 'error',

      'no-undef': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      'import/no-unresolved': 'off',
      'obsidianmd/validate-manifest': 'off',
      'obsidianmd/validate-license': 'off',
      'obsidianmd/ui/sentence-case': ['warn', { enforceCamelCaseLower: true, ignoreWords: ['Clew'] }],
    },
  },
  globalIgnores([
    'main.js',
    '.context',
    'bench',
    'coverage',
    'esbuild.config.mjs',
    '**/*.test.*',
    'tests',
    '**/*.cjs',
    '**/*.mjs',
    'scripts',
    'docs',
  ]),
]);
