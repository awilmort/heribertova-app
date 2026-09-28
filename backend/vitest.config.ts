import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'backend',
    include: ['src/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // The first run downloads the MongoDB binary used by mongodb-memory-server.
    hookTimeout: 120_000,
  },
});
