#!/usr/bin/env node
/**
 * Parse every local snapshot with the real core output schemas.
 *
 * This proves the preview fixtures cannot drift from @edufish/plugin. It runs
 * without a browser and falls back to the sibling package dist when the
 * preview package has not been npm-installed yet.
 */
import { fixtures, wireOperation } from '../src/fixtures.js';

let core;
try {
  core = await import('@edufish/plugin');
} catch {
  core = await import('../../../packages/edufish-plugin/dist/index.js');
}

const { OPERATION_OUTPUT_SCHEMAS } = core;
let failures = 0;

for (const [shortName, snapshot] of Object.entries(fixtures)) {
  const operation = wireOperation(shortName);
  const schema = OPERATION_OUTPUT_SCHEMAS[operation];
  if (!schema) {
    console.error(`missing core output schema for ${operation}`);
    failures += 1;
    continue;
  }
  const parsed = schema.safeParse(snapshot);
  if (!parsed.success) {
    failures += 1;
    console.error(`${operation} FAILED`);
    console.error(JSON.stringify(parsed.error.issues, null, 2));
  } else {
    console.log(`${operation} ok`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} fixture(s) do not match the core schemas.`);
  process.exit(1);
}
console.log('\nAll 8 fixtures match @edufish/plugin output schemas.');
