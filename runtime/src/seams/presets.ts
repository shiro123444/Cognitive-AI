import type { Context } from '../cordis/context.js';

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  defaultTools: string[];
  systemPromptOverride?: string;
}

export class AgentPresetsService {
  private _presets = new Map<string, AgentPreset>();

  constructor(private ctx: Context) {
    this.register({
      id: 'student-tutor',
      name: '启发式 AI 助教 (Student Tutor)',
      description: '面向学生的 Socratic 启发式对话辅导，结合教材 RAG 与 3D 脑结构/知识图谱动态呈现。',
      defaultTools: ['edu_rag_search', 'knowledge_graph_query', 'neurolab_visualize_nii', 'quiz_generate'],
    });

    this.register({
      id: 'teacher-studio',
      name: '课程与学情工作台 (Teacher Studio)',
      description: '面向教师的教学设计、知识点抽取、课程大纲生成与学情诊断分析。',
      defaultTools: ['curriculum_analyzer', 'student_diagnostics_query', 'knowledge_graph_extract'],
    });

    this.register({
      id: 'neurolab',
      name: '脑与认知科学实验台 (NeuroLab)',
      description: '脑科学数据切片、NIfTI 3D 渲染控制、EEG/fMRI 实验流水线分析。',
      defaultTools: ['neurolab_visualize_nii', 'neurolab_pipeline_run', 'neurolab_stat_chart'],
    });

    this.register({
      id: 'autonomous-pilot',
      name: '全自主学习领航员 (Autonomous Pilot)',
      description: '全自动分析学生知识弱项，自动编排实验与测试，自主领航学习全过程。',
      defaultTools: ['edu_rag_search', 'knowledge_graph_query', 'neurolab_visualize_nii', 'quiz_generate', 'cordis_define'],
    });
  }

  register(preset: AgentPreset) {
    this._presets.set(preset.id, preset);
  }

  get(id: string): AgentPreset | undefined {
    return this._presets.get(id);
  }

  list(): AgentPreset[] {
    return Array.from(this._presets.values());
  }
}

export function applyAgentPresetsPlugin(ctx: Context) {
  const presets = new AgentPresetsService(ctx);
  return ctx.provide('agentPresets', presets);
}
