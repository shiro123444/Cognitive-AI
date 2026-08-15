import type { Context } from '../cordis/context.js';
import type { Disposable } from '../cordis/types.js';

export interface PromptSection {
  id: string;
  priority: number;
  render: (ctx: Context) => string | Promise<string>;
}

export class SystemPromptService {
  private _sections: PromptSection[] = [];

  constructor(private ctx: Context) {
    this.register({
      id: 'core-agentos',
      priority: 100,
      render: () =>
        `You are Cognitive-AI (EduFish AgentOS), an autonomous, 24/7 all-weather educational agent operating on a Cordis microkernel.
Your goal is to guide students through deep cognitive science and AI concepts using Socratic questioning, interactive 3D visualizations, and concept graphs.
When relevant, call specialized tools to mount live interactive Client Slots (e.g. 3D brain viewer, knowledge graph, interactive quiz) without requiring the student to click around manually.`,
    });
  }

  register(section: PromptSection): Disposable {
    this._sections.push(section);
    this._sections.sort((a, b) => b.priority - a.priority);
    return () => {
      this._sections = this._sections.filter((s) => s.id !== section.id);
    };
  }

  async assemble(ctx: Context): Promise<string> {
    const parts = await Promise.all(this._sections.map((s) => s.render(ctx)));
    return parts.filter(Boolean).join('\n\n');
  }
}

export function applySystemPromptPlugin(ctx: Context) {
  const prompt = new SystemPromptService(ctx);
  return ctx.provide('systemPrompt', prompt);
}
