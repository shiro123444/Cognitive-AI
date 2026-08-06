import type { FastifyInstance } from 'fastify';

import type { RuntimeService } from '../../core/runtime-service.js';
import type { AgentLoopEvent } from '../../agent/agent-loop.js';

/**
 * Server-Sent Events endpoint for real-time event streaming.
 * GET /runtime/events/:sessionId/stream
 *
 * Subscribes to the EventBus and pushes events as SSE messages.
 * Connection stays open until the client disconnects or a terminal event arrives.
 */
export function registerEventStreamRoute(app: FastifyInstance) {
  app.get('/runtime/events/:sessionId/stream', async (request, reply) => {
    const runtime = (app as any).runtime as RuntimeService | null;

    if (!runtime) {
      reply.code(503);
      return { error: 'runtime not initialized' };
    }

    const params = request.params as { sessionId: string };
    const sessionId = params.sessionId;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const unsubscribe = runtime.eventBus.subscribe((event: AgentLoopEvent) => {
      // Only forward events for this session (run_id is in the event, session filtering
      // happens at the run level — all events from runs in this session are forwarded)
      const data = JSON.stringify(event);
      reply.raw.write(`data: ${data}\n\n`);

      // Close on terminal events
      if (event.type === 'agent.end') {
        reply.raw.write('event: done\ndata: {}\n\n');
        reply.raw.end();
      }
    });

    // Clean up on client disconnect
    request.raw.on('close', () => {
      unsubscribe();
    });

    // Don't let Fastify auto-send a response — we're managing the stream manually
    await reply;
  });
}
