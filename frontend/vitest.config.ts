import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    name: 'frontend',
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx'],
    // Component tests opt into jsdom with a `@vitest-environment jsdom` docblock; the rest run in node.
    setupFiles: ['vitest.setup.ts'],
  },
});
