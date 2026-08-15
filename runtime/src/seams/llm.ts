import type { Context } from '../cordis/context.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface LLMStreamChunk {
  delta?: {
    content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason?: string;
}

export interface LLMAdapter {
  name: string;
  chatStream: (
    messages: LLMMessage[],
    tools?: any[],
    options?: Record<string, any>
  ) => AsyncIterable<LLMStreamChunk>;
}

export class LLMRegistry {
  private _adapters = new Map<string, LLMAdapter>();
  public defaultAdapter = 'deepseek';

  constructor(private ctx: Context) {
    // Default Faux / Cognitive Mock adapter for instant local execution if no API key
    this.register({
      name: 'cognitive-sim',
      async *chatStream(messages, tools) {
        const lastMsg = messages[messages.length - 1]?.content || '';
        if (lastMsg.includes('脑') || lastMsg.includes('海马') || lastMsg.includes('neuro') || lastMsg.includes('实验')) {
          yield {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_neuro_1',
                  function: {
                    name: 'neurolab_visualize_nii',
                    arguments: JSON.stringify({
                      structureName: 'Hippocampus (海马体)',
                      coordinates: [24, -18, -16],
                      colormap: 'warm',
                    }),
                  },
                },
              ],
            },
          };
          yield { finish_reason: 'tool_calls' };
        } else if (lastMsg.includes('图谱') || lastMsg.includes('概念') || lastMsg.includes('记忆') || lastMsg.includes('graph')) {
          yield {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_graph_1',
                  function: {
                    name: 'knowledge_graph_query',
                    arguments: JSON.stringify({
                      focusConcept: '海马体与陈述性记忆巩固',
                      depth: 2,
                    }),
                  },
                },
              ],
            },
          };
          yield { finish_reason: 'tool_calls' };
        } else {
          const reply = `【Cognitive-AI 启发式辅导】：\n关于您提出的问题「${lastMsg}」，从认知科学的角度来看：\n1. **核心认知机制**：信息输入首先经过感觉记忆，随后在工作记忆中受到注意力的调控与编码。\n2. **神经解剖学基础**：内侧颞叶（MTL）及海马体负责陈述性记忆的快速编码与早期巩固。\n3. **自动化探索**：我已为您同步在右侧工作区加载相关概念图谱与实验数据。`;
          const words = reply.split('');
          for (let i = 0; i < words.length; i += 3) {
            yield { delta: { content: words.slice(i, i + 3).join('') } };
            await new Promise((r) => setTimeout(r, 20));
          }
          yield { finish_reason: 'stop' };
        }
      },
    });
  }

  register(adapter: LLMAdapter) {
    this._adapters.set(adapter.name, adapter);
    return () => this._adapters.delete(adapter.name);
  }

  get(name?: string): LLMAdapter {
    const target = name || this.defaultAdapter;
    const adapter = this._adapters.get(target) || this._adapters.get('cognitive-sim');
    if (!adapter) {
      throw new Error(`LLM adapter not found: ${target}`);
    }
    return adapter;
  }
}

export function applyLLMPlugin(ctx: Context) {
  const llm = new LLMRegistry(ctx);
  return ctx.provide('llm', llm);
}
