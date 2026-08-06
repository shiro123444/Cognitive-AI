import type { FastifyInstance } from 'fastify';

import { SessionSchema } from '../../protocol/types.js';
import type { RuntimeService } from '../../core/runtime-service.js';

export function registerSessionRoutes(app: FastifyInstance) {
  app.post('/runtime/sessions', async (request, reply) => {
    const runtime = (app as any).runtime as RuntimeService | null;

    if (runtime) {
      const body = request.body as { participants?: string[] };
      const session = await runtime.sessions.create({
        participants: body.participants ?? [],
      });
      reply.code(201);
      return session;
    }

    // Fallback: validate-only mode (for tests without full runtime)
    const session = SessionSchema.parse(request.body);
    reply.code(201);
    return session;
  });

  app.get('/runtime/sessions', async (request, reply) => {
    const runtime = (app as any).runtime as RuntimeService | null;
    if (!runtime) {
      reply.code(503);
      return { error: 'runtime not initialized' };
    }
    const query = request.query as { limit?: string };
    const limit = query.limit ? Math.max(1, Math.min(200, Number(query.limit))) : 50;
    const sessions = await runtime.sessions.listSessions(limit);
    return { sessions };
  });

  app.get('/runtime/sessions/:sessionId/resume', async (request, reply) => {
    const runtime = (app as any).runtime as RuntimeService | null;
    if (!runtime) {
      reply.code(503);
      return { error: 'runtime not initialized' };
    }
    const params = request.params as { sessionId: string };
    const query = request.query as { recent_event_limit?: string };
    const recentLimit = query.recent_event_limit
      ? Math.max(1, Math.min(500, Number(query.recent_event_limit)))
      : 50;
    const result = await runtime.sessions.resume(params.sessionId, {
      recentEventLimit: recentLimit,
    });
    if (!result) {
      reply.code(404);
      return { error: `session not found: ${params.sessionId}` };
    }
    return result;
  });
}
