import type { FastifyInstance } from 'fastify';

import type { RuntimeService } from '../../core/runtime-service.js';

interface StartRunBody {
  session_id: string;
  agent_id: string;
  system_prompt: string;
  user_message: string;
  max_turns?: number;
}

export function registerRunRoutes(app: FastifyInstance) {
  app.post('/runtime/runs', async (request, reply) => {
    const runtime = (app as any).runtime as RuntimeService | null;

    if (!runtime) {
      reply.code(503);
      return { error: 'runtime not initialized' };
    }

    const body = request.body as StartRunBody;

    if (!body.session_id || !body.agent_id || !body.user_message) {
      reply.code(400);
      return { error: 'session_id, agent_id, and user_message are required' };
    }

    const result = await runtime.startRun({
      sessionId: body.session_id,
      agentId: body.agent_id,
      systemPrompt: body.system_prompt ?? '',
      userMessage: body.user_message,
      maxTurns: body.max_turns,
    });

    reply.code(201);
    return {
      run_id: result.runId,
      final_state: result.finalState,
    };
  });
}
