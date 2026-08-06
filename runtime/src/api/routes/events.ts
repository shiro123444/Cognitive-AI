import type { FastifyInstance } from 'fastify';

import type { RuntimeService } from '../../core/runtime-service.js';

export function registerEventRoutes(app: FastifyInstance) {
  app.get('/runtime/events/:sessionId', async (request, reply) => {
    const runtime = (app as any).runtime as RuntimeService | null;
    const params = request.params as { sessionId: string };
    const query = request.query as { last_seen_seq?: string };
    const lastSeenSeq = Number(query.last_seen_seq || 0);

    if (runtime) {
      const events = await runtime.sessions.getEvents(params.sessionId, lastSeenSeq);
      return { session_id: params.sessionId, last_seen_seq: lastSeenSeq, events };
    }

    // Fallback: empty response for tests without full runtime
    return { session_id: params.sessionId, last_seen_seq: lastSeenSeq, events: [] };
  });
}
