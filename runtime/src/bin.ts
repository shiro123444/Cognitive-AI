import { createRuntimeApp } from './server.js';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const { app } = await createRuntimeApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[Cognitive-AI DSH AgentOS Runtime] Server running at http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('Fatal error starting runtime server:', err);
    process.exit(1);
  }
}

main();
