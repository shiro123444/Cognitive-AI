import Fastify from 'fastify';

import { registerEventRoutes } from './api/routes/events.js';
import { registerEventStreamRoute } from './api/routes/event-stream.js';
import { registerHealthRoute } from './api/routes/health.js';
import { registerRunRoutes } from './api/routes/runs.js';
import { registerSessionRoutes } from './api/routes/sessions.js';
import type { RuntimeService } from './core/runtime-service.js';

export interface ServerOptions {
  runtime?: RuntimeService;
}

export function buildServer(options: ServerOptions = {}) {
  const app = Fastify();

  // Attach runtime to request context via decorator
  app.decorate('runtime', options.runtime ?? null);

  registerHealthRoute(app);
  registerSessionRoutes(app);
  registerRunRoutes(app);
  registerEventRoutes(app);
  registerEventStreamRoute(app);
  return app;
}
