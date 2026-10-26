import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', include: ['test/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'], testTimeout: 15000,
    server: {deps: {inline: ['@lobehub/ui', '@lobehub/icons']}},
  },
});
