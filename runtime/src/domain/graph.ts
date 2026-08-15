import type { Context } from '../cordis/context.js';
import type { ToolRegistry } from '../seams/tools.js';

export function applyKnowledgeGraphPlugin(ctx: Context) {
  const tools: ToolRegistry = (ctx as any).tools;
  if (!tools) return;

  tools.register({
    name: 'knowledge_graph_query',
    description: 'Query concept relationships and topological knowledge graph nodes for visual exploration.',
    parameters: {
      type: 'object',
      properties: {
        focusConcept: { type: 'string', description: 'Core concept node to expand around.' },
        depth: { type: 'number', description: 'Graph neighborhood expansion depth (1-3).' },
      },
      required: ['focusConcept'],
    },
    slotBinding: {
      slotId: 'slot:knowledge-graph',
      kind: 'd3-graph',
      transform: (result) => result,
    },
    async execute(args) {
      const { focusConcept } = args;
      return {
        focus: focusConcept,
        nodes: [
          { id: '1', name: '海马体 (Hippocampus)', category: 'BrainStructure', radius: 28, group: 1 },
          { id: '2', name: '陈述性记忆 (Declarative Memory)', category: 'CognitiveFunction', radius: 24, group: 2 },
          { id: '3', name: '长时程增强 (LTP)', category: 'Mechanism', radius: 22, group: 3 },
          { id: '4', name: '齿状回 (Dentate Gyrus)', category: 'Subfield', radius: 18, group: 1 },
          { id: '5', name: 'CA3 锥体神经元', category: 'Subfield', radius: 18, group: 1 },
          { id: '6', name: 'NMDA 受体', category: 'Molecular', radius: 16, group: 3 },
          { id: '7', name: '工作记忆 (Working Memory)', category: 'CognitiveFunction', radius: 20, group: 2 },
          { id: '8', name: '前额叶皮层 (PFC)', category: 'BrainStructure', radius: 24, group: 1 },
        ],
        links: [
          { source: '1', target: '2', label: '主要支持', value: 3 },
          { source: '1', target: '3', label: '突触可塑性基础', value: 4 },
          { source: '1', target: '4', label: '包含亚区', value: 2 },
          { source: '4', target: '5', label: '苔藓纤维投射', value: 2 },
          { source: '3', target: '6', label: '依赖激活', value: 3 },
          { source: '7', target: '8', label: '神经定位', value: 3 },
          { source: '2', target: '7', label: '信息传递与转化', value: 2 },
          { source: '1', target: '8', label: '功能连接', value: 2 },
        ],
      };
    },
  });
}
