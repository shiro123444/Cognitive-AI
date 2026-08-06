/**
 * Bootstrap entry point for the Agent Runtime.
 *
 * Reads environment variables and starts the runtime server.
 * This is the main entry point for production deployments (Docker, systemd, etc.).
 */

import { buildServer } from './server.js';
import { createRuntimeDb } from './persistence/db.js';
import { migrateRuntimeDb } from './persistence/migrations.js';
import { RuntimeService } from './core/runtime-service.js';
import { FauxProvider } from './agent/faux-provider.js';
import { OpenAICompatibleProvider } from './agent/openai-provider.js';

const port = Number(process.env.RUNTIME_PORT ?? 4000);
const connectionString = process.env.RUNTIME_DATABASE_URL;
const capabilityBaseUrl = process.env.CAPABILITY_BASE_URL ?? 'http://localhost:5001';
const providerName = process.env.RUNTIME_PROVIDER ?? 'faux';

async function main(): Promise<void> {
  if (!connectionString) {
    console.error('RUNTIME_DATABASE_URL is required');
    process.exit(1);
  }

  const db = createRuntimeDb({ connectionString });
  await migrateRuntimeDb(db);

  // Provider factory: 'faux' for smoke tests, 'openai' for real LLM闭环.
  const provider = (() => {
    switch (providerName) {
      case 'faux':
        return FauxProvider.text('runtime bootstrap ready');
      case 'openai': {
        const baseUrl = process.env.RUNTIME_LLM_BASE_URL ?? '';
        const apiKey = process.env.RUNTIME_LLM_API_KEY ?? '';
        const model = process.env.RUNTIME_LLM_MODEL ?? '';
        if (!baseUrl || !apiKey || !model) {
          throw new Error(
            'RUNTIME_PROVIDER=openai requires RUNTIME_LLM_BASE_URL, RUNTIME_LLM_API_KEY, RUNTIME_LLM_MODEL'
          );
        }
        return new OpenAICompatibleProvider({ baseUrl, apiKey, model });
      }
      default:
        throw new Error(`unknown RUNTIME_PROVIDER: ${providerName}`);
    }
  })();

  const runtime = new RuntimeService({ db, capabilityBaseUrl, provider });
  const app = buildServer({ runtime });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`runtime listening on :${port} (provider=${providerName}, capabilities=${capabilityBaseUrl})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
