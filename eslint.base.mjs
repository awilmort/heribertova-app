// Shared ESLint rules for the TypeScript packages (shared, backend).
// The frontend extends Next.js' own config instead (see frontend/eslint.config.mjs).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export function typescriptConfig(tsconfigRootDir) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**'] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        eqeqeq: ['error', 'always'],
      },
    },
    {
      files: ['**/*.{js,mjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    prettier,
  );
}
