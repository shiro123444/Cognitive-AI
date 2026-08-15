import fastify, { FastifyInstance } from 'fastify';
import { Context } from './cordis/context.js';
import { applySessionPlugin } from './seams/session.js';
import { applyToolsPlugin } from './seams/tools.js';
import { applyLLMPlugin } from './seams/llm.js';
import { applySystemPromptPlugin } from './seams/system-prompt.js';
import { applyAgentLoopPlugin } from './seams/agent.js';
import { applyAgentPresetsPlugin } from './seams/presets.js';
import { applyDynamicCordisPlugin } from './seams/dynamic.js';
import { applyEduRagPlugin } from './domain/rag.js';
import { applyKnowledgeGraphPlugin } from './domain/graph.js';
import { applyNeuroLabPlugin } from './domain/neurolab.js';
import { applyAssignmentPlugin } from './domain/assignment.js';

export async function createRuntimeApp(): Promise<{ app: FastifyInstance; ctx: Context }> {
  const app = fastify({ logger: false });

  // 1. Initialize Cordis Root Context
  const ctx = new Context();

  // 2. Load Core Seams
  applySessionPlugin(ctx);
  applyToolsPlugin(ctx);
  applyLLMPlugin(ctx);
  applySystemPromptPlugin(ctx);
  applyAgentLoopPlugin(ctx);
  applyAgentPresetsPlugin(ctx);
  applyDynamicCordisPlugin(ctx);

  // 3. Load Domain Plugins
  applyEduRagPlugin(ctx);
  applyKnowledgeGraphPlugin(ctx);
  applyNeuroLabPlugin(ctx);
  applyAssignmentPlugin(ctx);

  // Enable CORS
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      reply.status(200).send();
    }
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    runtime: 'Cognitive-AI DSH Cordis AgentOS',
    timestamp: Date.now(),
  }));

  // Presets list
  app.get('/api/v2/presets', async () => {
    const presets = (ctx as any).agentPresets.list();
    return { presets };
  });

  // Session details
  app.get('/api/v2/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = (ctx as any).sessions.get(id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return session;
  });

  // List sessions
  app.get('/api/v2/sessions', async () => {
    const sessions = (ctx as any).sessions.list();
    return { sessions };
  });

  // Turn Execution (SSE Streaming & Autonomous chaining)
  app.post('/api/v2/agent/turn', async (req, reply) => {
    const body = (req.body || {}) as {
      sessionId?: string;
      userInput?: string;
      presetId?: string;
      stream?: boolean;
    };

    const sessionId = body.sessionId || `session_${Date.now()}`;
    const userInput = body.userInput || '';
    const presetId = body.presetId || 'student-tutor';
    const isStream = body.stream !== false;

    if (isStream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendSSE = (event: string, data: any) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        sendSSE('connected', { sessionId, presetId });

        await (ctx as any).agentLoop.runTurn({
          sessionId,
          userInput,
          presetId,
          onChunk: (chunk: string) => {
            sendSSE('chunk', { delta: chunk });
          },
        });

        // Send latest session snapshot with slots
        const session = (ctx as any).sessions.get(sessionId);
        sendSSE('completed', session);
        reply.raw.end();
      } catch (err: any) {
        sendSSE('error', { message: err.message || String(err) });
        reply.raw.end();
      }
    } else {
      const session = await (ctx as any).agentLoop.runTurn({
        sessionId,
        userInput,
        presetId,
      });
      return session;
    }
  });

  return { app, ctx };
}
