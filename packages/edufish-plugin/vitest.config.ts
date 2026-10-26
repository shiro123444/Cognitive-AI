import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const localZod = fileURLToPath(
  new URL('./node_modules/zod/package.json', import.meta.url),
);
const runtimeZod = fileURLToPath(
  new URL('../../runtime/node_modules/zod/index.js', import.meta.url),
);

// Local validation without installing package dependencies. A portable
// install resolves `zod` from this package's own node_modules instead.
const alias =
  !existsSync(localZod) && existsSync(runtimeZod)
    ? { zod: runtimeZod }
    : {};

export default {
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
};
