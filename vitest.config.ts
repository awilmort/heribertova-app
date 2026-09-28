import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'shared',
      'backend',
      'frontend',
      // Repository tooling (git hooks) at the root.
      { test: { name: 'scripts', include: ['scripts/**/*.test.mjs'] } },
    ],
  },
});
