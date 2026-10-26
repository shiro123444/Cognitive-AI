#!/usr/bin/env node
/**
 * Manual preview with a real loopback fixture backend.
 *
 * Usage:
 *   npm run dev:actual
 *
 * Prints only the Vite URL. The fixture handshake and JWTs are never printed.
 */
import { withServers } from './orchestrate.mjs';

let resolveStop;
const stopped = new Promise((resolve) => {
  resolveStop = resolve;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => resolveStop());
}

try {
  await withServers(async ({ vite }) => {
    console.log(`Preview (actual HTTP mode available): ${vite.url}`);
    console.log('Press Ctrl+C to stop both processes.');
    await stopped;
  });
  process.exitCode = 0;
} catch (error) {
  console.error(error?.message ?? error);
  process.exitCode = 1;
}
