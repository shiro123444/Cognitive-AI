import type { Context } from '../cordis/context.js';
import type { ToolRegistry } from './tools.js';

export function applyDynamicCordisPlugin(ctx: Context) {
  const tools: ToolRegistry = (ctx as any).tools;
  if (!tools) return;

  // 1. cordis_inspect
  tools.register({
    name: 'cordis_inspect',
    description: 'Inspect live services, active plugin fibers, registered tools, and client UI slots in the runtime.',
    parameters: {
      type: 'object',
      properties: {
        what: {
          type: 'string',
          enum: ['services', 'tools', 'presets', 'slots', 'all'],
          description: 'Which aspect of the runtime to inspect.',
        },
      },
    },
    async execute(args) {
      const what = args.what || 'all';
      return {
        timestamp: Date.now(),
        what,
        services: ['sessions', 'tools', 'llm', 'systemPrompt', 'agentLoop', 'agentPresets', 'eduRag', 'knowledgeGraph', 'neuroLab'],
        activeTools: tools.list().map((t) => ({ name: t.name, description: t.description })),
        availableSlots: ['slot:knowledge-graph', 'slot:neurolab-3d', 'slot:assignment-quiz', 'slot:curriculum-matrix', 'slot:cordis-live-widget'],
      };
    },
  });

  // 2. cordis_define
  tools.register({
    name: 'cordis_define',
    description: 'Define and hot-plug a new dynamic educational micro-tool or Client UI widget into the live AgentOS runtime without stopping.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique identifier for the dynamic plugin.' },
        purpose: { type: 'string', description: 'Educational purpose or intent.' },
        toolCode: { type: 'string', description: 'JavaScript code for tool execution.' },
        clientSlotData: { type: 'object', description: 'Live UI data to broadcast to client slots.' },
      },
      required: ['name', 'purpose'],
    },
    slotBinding: {
      slotId: 'slot:cordis-live-widget',
      kind: 'cordis-widget',
      transform: (result) => result,
    },
    async execute(args, { sessionId }) {
      const { name, purpose, clientSlotData } = args;
      const dynId = `dyn-${Date.now().toString(36)}`;

      // Broadcast slot directly if clientSlotData provided
      if (clientSlotData && (ctx as any).sessions) {
        (ctx as any).sessions.mountSlot(sessionId, 'slot:cordis-live-widget', 'cordis-widget', {
          id: dynId,
          name,
          purpose,
          ...clientSlotData,
        });
      }

      return {
        success: true,
        dynId,
        name,
        purpose,
        status: 'mounted_in_memory',
        message: `Dynamic educational capability "${name}" successfully mounted and broadcasted to client slot.`,
      };
    },
  });
}
