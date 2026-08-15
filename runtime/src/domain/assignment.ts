import type { Context } from '../cordis/context.js';
import type { ToolRegistry } from '../seams/tools.js';

export function applyAssignmentPlugin(ctx: Context) {
  const tools: ToolRegistry = (ctx as any).tools;
  if (!tools) return;

  tools.register({
    name: 'quiz_generate',
    description: 'Generate an interactive, Socratic question or test card to assess student comprehension directly in the stream.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Core concept topic.' },
        difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
      },
      required: ['topic'],
    },
    slotBinding: {
      slotId: 'slot:assignment-quiz',
      kind: 'quiz-card',
      transform: (result) => result,
    },
    async execute(args) {
      const { topic } = args;
      return {
        quizId: `quiz_${Date.now()}`,
        topic,
        question: `根据双重编码理论与神经解剖学研究，当切除双侧内侧颞叶（包含海马体）后，患者最可能表现出下列哪种记忆障碍？`,
        options: [
          { id: 'A', text: '无法保留原有的童年远期记忆' },
          { id: 'B', text: '无法形成新的陈述性长时记忆（顺行性遗忘），但保留动作技能学习能力' },
          { id: 'C', text: '瞬时工作记忆（如复述 7 位数字）完全丧失' },
          { id: 'D', text: '情绪感知能力完全丧失' },
        ],
        correctOption: 'B',
        explanation: '经典病例 H.M. 证实海马体对于陈述性长时记忆的巩固至关重要，但不损害技能学习（非陈述性记忆）与短时工作记忆。',
      };
    },
  });
}
