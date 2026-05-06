export const eduFishCourseOptions = [
  {
    id: 'AI101',
    name: '人工智能导论',
    teacher: '韩老师',
    semester: '2026 春季学期',
    department: '智能科学学院',
    modelMode: 'AI EDUCATION QUALITY'
  },
  {
    id: 'BC201',
    name: '脑与认知科学导论',
    teacher: '韩老师',
    semester: '2026 春季学期',
    department: '智能科学学院',
    modelMode: 'COGNITIVE SCIENCE QUALITY'
  }
];

export function createEduFishDemoPayload() {
  return {
    dataset_meta: {
      name: '2026 Spring Teaching Quality',
      school_name: '示范大学',
      department_name: '智能科学学院'
    },
    dataset: {
      courses: [
        { '课程编号': 'AI101', '课程名称': '人工智能导论', '授课教师': '韩老师', '院系': '智能科学学院', '学期': '2026春' },
        { '课程编号': 'BC201', '课程名称': '脑与认知科学导论', '授课教师': '韩老师', '院系': '智能科学学院', '学期': '2026春' }
      ],
      teachers: [
        { '工号': 'T001', '教师姓名': '韩老师', '院系': '智能科学学院', '职称': '教授' },
        { '工号': 'T002', '教师姓名': '韩老师', '院系': '智能科学学院', '职称': '副教授' }
      ],
      students: [
        { '学号': 'S001', '学生姓名': '小周', '班级': 'AI一班' },
        { '学号': 'S002', '学生姓名': '小林', '班级': '认知一班' },
        { '学号': 'S003', '学生姓名': '小陈', '班级': 'AI一班' },
        { '学号': 'S004', '学生姓名': '小许', '班级': '认知一班' }
      ],
      feedback: [
        { '课程编号': 'AI101', '学号': 'S001', '评分': '4.7', '反馈': '案例清晰，课堂互动充分' },
        { '课程编号': 'AI101', '学号': 'S003', '评分': '4.3', '反馈': '项目任务有挑战，助教答疑及时' },
        { '课程编号': 'BC201', '学号': 'S002', '评分': '3.2', '反馈': '实验讲解偏快，希望增加复盘' },
        { '课程编号': 'BC201', '学号': 'S004', '评分': '3.8', '反馈': '脑区模型抽象，材料结构可以更清楚' }
      ],
      grades: [
        { '课程编号': 'AI101', '学号': 'S001', '成绩': '91' },
        { '课程编号': 'AI101', '学号': 'S003', '成绩': '86' },
        { '课程编号': 'BC201', '学号': 'S002', '成绩': '64' },
        { '课程编号': 'BC201', '学号': 'S004', '成绩': '74' }
      ],
      attendance: [
        { '课程编号': 'AI101', '学号': 'S001', '出勤率': '96' },
        { '课程编号': 'AI101', '学号': 'S003', '出勤率': '93' },
        { '课程编号': 'BC201', '学号': 'S002', '出勤率': '78' },
        { '课程编号': 'BC201', '学号': 'S004', '出勤率': '84' }
      ]
    }
  };
}

export function buildEduFishAnalysisRequest(datasetId, course) {
  return {
    dataset_id: datasetId,
    template_id: 'course-quality',
    audience_role: 'school_admin',
    scope: {
      department_name: course?.department || '智能科学学院',
      course_id: course?.id || eduFishCourseOptions[0].id,
      course_name: course?.name || eduFishCourseOptions[0].name
    }
  };
}

const layoutSlots = [
  { x: 585, y: 315, central: true },
  { x: 350, y: 170 },
  { x: 810, y: 170 },
  { x: 1080, y: 225, hollow: true },
  { x: 300, y: 440 },
  { x: 195, y: 545, hollow: true },
  { x: 790, y: 465 },
  { x: 950, y: 575, hollow: true }
];

const typePriority = {
  Course: 0,
  Department: 1,
  Teacher: 2,
  Student: 3,
  School: 4
};

const typeDetails = {
  Course: '课程节点连接教师、学生反馈、成绩与出勤，是本次质量分析的核心对象。',
  Department: '院系节点用于聚合课程质量、教师支持和治理风险。',
  Teacher: '教师节点用于追踪授课责任、反馈主题和后续改进动作。',
  Student: '学生节点提供学习达成、参与度和反馈证据。',
  School: '学校节点给出跨院系治理视角，用于审查整体质量趋势。'
};

export function mapEduFishGraph(graph = {}) {
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const degree = rawEdges.reduce((counts, edge) => {
    counts[edge.source] = (counts[edge.source] || 0) + 1;
    counts[edge.target] = (counts[edge.target] || 0) + 1;
    return counts;
  }, {});
  const ordered = [...rawNodes].sort((a, b) => {
    const priorityDiff = (typePriority[a.type] ?? 9) - (typePriority[b.type] ?? 9);
    if (priorityDiff !== 0) return priorityDiff;
    return (degree[b.id] || 0) - (degree[a.id] || 0);
  });

  const nodes = ordered.slice(0, layoutSlots.length).map((node, index) => {
    const slot = layoutSlots[index] || layoutSlots[layoutSlots.length - 1];
    const evidence = degree[node.id] || 1;
    return {
      id: node.id,
      label: node.label || node.id,
      type: node.type || 'Evidence',
      score: Math.min(96, 58 + evidence * 7),
      evidence,
      detail: typeDetails[node.type] || node.subtitle || '该节点来自后端证据图谱，可继续追踪相关关系与证据来源。',
      subtitle: node.subtitle || '',
      x: slot.x,
      y: slot.y,
      growthDelay: Number((index * 0.14).toFixed(2)),
      central: Boolean(slot.central),
      hollow: Boolean(slot.hollow)
    };
  });

  const positionById = nodes.reduce((positions, node) => {
    positions[node.id] = node;
    return positions;
  }, {});
  const edges = rawEdges
    .filter((edge) => positionById[edge.source] && positionById[edge.target])
    .map((edge, index) => ({
      id: edge.id || `edge-${index + 1}`,
      x1: positionById[edge.source].x,
      y1: positionById[edge.source].y,
      x2: positionById[edge.target].x,
      y2: positionById[edge.target].y,
      relationship: edge.relationship || '',
      growthDelay: Number((0.16 + index * 0.12).toFixed(2)),
      dashed: index % 3 === 1
    }));

  return { nodes, edges };
}

const predictionPresets = {
  'lab-review': {
    path: 'M 8 74 C 52 72, 88 62, 120 50 S 188 28, 252 18',
    points: [
      { id: 'lab-1', x: 8, y: 74, delay: 0.12 },
      { id: 'lab-2', x: 120, y: 50, delay: 0.52 },
      { id: 'lab-3', x: 252, y: 18, delay: 0.98 }
    ]
  },
  'peer-review': {
    path: 'M 8 72 C 62 68, 92 58, 132 54 S 194 38, 252 28',
    points: [
      { id: 'peer-1', x: 8, y: 72, delay: 0.12 },
      { id: 'peer-2', x: 132, y: 54, delay: 0.52 },
      { id: 'peer-3', x: 252, y: 28, delay: 0.98 }
    ]
  },
  'material-restructure': {
    path: 'M 8 76 C 46 70, 76 66, 112 56 S 178 34, 252 14',
    points: [
      { id: 'mat-1', x: 8, y: 76, delay: 0.12 },
      { id: 'mat-2', x: 112, y: 56, delay: 0.52 },
      { id: 'mat-3', x: 252, y: 14, delay: 0.98 }
    ]
  }
};

export const fallbackPredictionScenarios = normalizePredictionScenarios({
  scenarios: [
    {
      scenario_id: 'lab-review',
      name: '增加实验复盘',
      delta_label: '+7.8%',
      score: 84,
      rationale: '若在未来两周加入实验复盘与错题回看，预测内容清晰度和学习达成会同步上升。'
    },
    {
      scenario_id: 'peer-review',
      name: '引入同伴互评',
      delta_label: '+5.4%',
      score: 81,
      rationale: '同伴互评会优先改善参与度，但对成绩提升的影响需要至少一个作业周期才能观察。'
    },
    {
      scenario_id: 'material-restructure',
      name: '重排课程材料',
      delta_label: '+9.1%',
      score: 87,
      rationale: '若先重排材料结构，再补充案例，预测材料设计节点会成为下一轮质量提升的主要来源。'
    }
  ]
});

export function normalizePredictionScenarios(prediction = {}) {
  const scenarios = Array.isArray(prediction.scenarios) ? prediction.scenarios : [];
  return scenarios.map((scenario, index) => {
    const id = scenario.scenario_id || scenario.id || `scenario-${index + 1}`;
    const preset = predictionPresets[id] || predictionPresets['lab-review'];
    return {
      id,
      name: scenario.name || '教学干预',
      delta: scenario.delta_label || `+${scenario.delta || 0}%`,
      score: scenario.score || prediction.baseline_score || 0,
      path: preset.path,
      copy: scenario.rationale || scenario.copy || '该推演基于当前分析结果生成。',
      points: preset.points,
      actions: scenario.actions || []
    };
  });
}
