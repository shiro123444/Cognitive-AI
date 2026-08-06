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
}
