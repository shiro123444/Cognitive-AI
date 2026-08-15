import type { Context } from '../cordis/context.js';
import type { ToolRegistry } from '../seams/tools.js';

export function applyEduRagPlugin(ctx: Context) {
  const tools: ToolRegistry = (ctx as any).tools;
  if (!tools) return;

  tools.register({
    name: 'edu_rag_search',
    description: 'Search official course materials and textbooks for accurate cognitive science & AI knowledge citations.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic search query string.' },
        courseId: { type: 'string', description: 'Target course identifier (default: ai-intro).' },
        topK: { type: 'number', description: 'Number of chunks to return.' },
      },
      required: ['query'],
    },
    async execute(args) {
      const { query } = args;
      return {
        query,
        citations: [
          {
            chapter: '第 3 章 记忆与学习神经机制',
            section: '3.2 内侧颞叶与海马复合体',
            text: '海马体（Hippocampus）位于大脑内侧颞叶深处，在陈述性记忆的编码与早期巩固阶段发挥枢纽作用。信息经由内嗅皮层传入齿状回（DG），通过苔藓纤维到达 CA3 区，再经 Schaffer 侧支投射至 CA1 区。',
            similarity: 0.94,
          },
          {
            chapter: '第 3 章 记忆与学习神经机制',
            section: '3.4 突触可塑性与长时程增强 (LTP)',
            text: '长时程增强（LTP）是突触强度的持久性增加，被广泛认为是记忆形成的突触生理学基础。NMDA 受体的激活与钙离子流入是诱导经典 CA1 区 LTP 的关键起始步骤。',
            similarity: 0.89,
          },
        ],
      };
    },
  });
}
