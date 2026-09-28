import { typescriptConfig } from '../eslint.base.mjs';

export default [
  ...typescriptConfig(import.meta.dirname),
  {
    files: ['**/*.ts'],
    ignores: ['test/http.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'supertest',
              message:
                "Use `request` from test/http.ts: plain supertest can hit another process's port on macOS.",
            },
          ],
        },
      ],
    },
  },
];
