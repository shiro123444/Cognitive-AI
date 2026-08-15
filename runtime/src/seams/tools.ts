import type { Context } from '../cordis/context.js';
import type { Disposable } from '../cordis/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: any, meta: { sessionId: string; agentCtx: Context }) => Promise<any>;
  slotBinding?: {
    slotId: string;
    kind: string;
    transform?: (result: any) => any;
  };
}

export class ToolRegistry {
  private _tools = new Map<string, ToolDefinition>();

  constructor(private ctx: Context) {}

  register(tool: ToolDefinition): Disposable {
    if (this._tools.has(tool.name)) {
      console.warn(`[Tool Registry] Overwriting existing tool: ${tool.name}`);
    }
    this._tools.set(tool.name, tool);
    this.ctx.emit('tools/registered', tool);

    return () => {
      this._tools.delete(tool.name);
      this.ctx.emit('tools/unregistered', tool.name);
    };
  }

  get(name: string): ToolDefinition | undefined {
    return this._tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this._tools.values());
  }

  async execute(name: string, args: any, meta: { sessionId: string; agentCtx: Context }): Promise<any> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Pipeline: tools/pre-execute -> execute -> tools/post-execute
    const preResult = await this.ctx.waterfall('tools/pre-execute', { name, args, meta });
    let result: any;
    try {
      result = await tool.execute(preResult.args, preResult.meta);
    } catch (err: any) {
      result = { error: err.message || String(err) };
    }

    const postResult = await this.ctx.waterfall('tools/post-execute', result, { name, args: preResult.args, meta });

    // Auto-mount to slot if tool has slotBinding
    if (tool.slotBinding && (this.ctx as any).sessions) {
      const slotData = tool.slotBinding.transform ? tool.slotBinding.transform(postResult) : postResult;
      (this.ctx as any).sessions.mountSlot(meta.sessionId, tool.slotBinding.slotId, tool.slotBinding.kind, slotData);
    }

    return postResult;
  }
}

export function applyToolsPlugin(ctx: Context) {
  const tools = new ToolRegistry(ctx);
  return ctx.provide('tools', tools);
}
