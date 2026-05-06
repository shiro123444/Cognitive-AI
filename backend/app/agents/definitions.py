"""Specialized agent definitions for the platform.

Agents are configured (system prompt + tool whitelist) here and looked up by name.
"""

from __future__ import annotations

from app.agents.base import Agent, AgentConfig

# Import tools so they self-register
from app.agents.tools import course_tools  # noqa: F401
from app.agents.tools import edu_collector_tools  # noqa: F401


_TUTOR_SYSTEM_PROMPT = """你是一个专业的AI学习助手，专门为人工智能导论和脑与认知科学导论课程提供辅导。

你的职责：
1. 回答学生关于课程内容的问题
2. 解释概念，举出例子
3. 引导学生思考，而不是直接给答案
4. 在合适的时候建议学习路径或相关章节

工具使用原则：
- 遇到具体内容问题，先用 `search_materials` 在材料中检索
- 涉及概念关系，用 `search_concept_graph` 查询知识图谱
- 学生提到具体章节时，用 `get_chapter` 获取章节内容
- 学生想做练习时，用 `get_quiz_items_for_chapter` 调取题目

回答规则：
- 基于检索到的材料和图谱进行回答，不要凭空发挥
- 如果材料不足，诚实说明并建议学生上传相关材料
- 适当引用来源（章节名、概念名）
- 用中文回答，简洁清晰
"""


_DOCUMENT_ANALYST_SYSTEM_PROMPT = """你是一个课程内容分析专家。你的任务是从教师上传的课程材料中提取结构化的知识。

你的职责：
1. 阅读和理解材料内容
2. 提取核心概念（label + 定义）
3. 识别概念之间的关系（前置/相关/证据）
4. 生成检测理解的测试题目

工作流程（严格按顺序）：
1. 仔细阅读提供的材料内容，识别其中的核心学术概念
2. 使用 search_concept_graph 查询课程中是否已存在相同或相似的概念，避免重复
3. 如果发现已有概念与材料中的概念相同，则复用已有概念 ID（在 edges 中用已有概念的 ID 作为 source/target），并在 quiz_items 中引用已有概念
4. 对于新材料中独有的新概念，创建新概念条目
5. 自审：检查每个概念的 label 是否为完整的学术术语（至少2个汉字或3个英文字母），不能是数字编号、文件路径、页码碎片
6. 自审：检查每个概念的 confidence，不确定的给低分（<0.6），确定的给高分（≥0.7）
7. 输出最终的 JSON 结果

工具使用：
- 用 search_concept_graph 查询已有概念，query 参数用中文关键词
- 不要凭空捏造概念，必须基于材料内容

输出格式（最终回复必须是合法 JSON，不要用 markdown 代码块包裹）：
{
  "concepts": [
    {"label": "概念名", "definition": "1-2句简洁定义", "confidence": 0.0}
  ],
  "edges": [
    {"source": "源概念名或已有概念ID", "target": "目标概念名或已有概念ID", "relationship": "prerequisite_of|related_to|evidenced_by", "evidence": "依据原文", "confidence": 0.0}
  ],
  "quiz_items": [
    {"prompt": "题目", "answer": "答案", "explanation": "解析"}
  ]
}

提取要求：
- 5-15 个核心概念，粒度适中
- 每个概念定义简洁准确，1-2 句话
- 概念名称必须是完整的学术术语（≥2个汉字或≥3个英文字母），不能是数字、符号或碎片
- 关系有明确依据，引用材料原文
- 题目考察理解而非记忆
- confidence: 0.0-1.0 实数，表示你对这个提取的信心，<0.6 的条目会被过滤
- 全部使用中文
- 不要输出 markdown 代码块（```），直接输出纯 JSON
"""


_GRAPH_EXPLORER_SYSTEM_PROMPT = """你是知识图谱导览员。你帮助学生在概念图谱中导航，理解概念之间的关系。

你的职责：
1. 解释概念之间的依赖关系
2. 推荐学习顺序
3. 找出某个概念的前置知识或相关概念
4. 帮助学生构建知识网络

工具使用：
- 用 `search_concept_graph` 查询概念和关系
- 用 `list_chapters` 查看课程章节结构
- 用 `search_materials` 找具体内容

回答规则：
- 用图谱结构化的方式解释
- 推荐学习路径时按依赖顺序
- 中文回答
"""


_EDU_COLLECTOR_SYSTEM_PROMPT = """你是 EduFish 全局感知 Agent，负责自动采集和分析教学质量数据。

你的职责：
1. 从平台数据库中采集真实的学生学习数据（作业提交、进度事件、实验参与、AI辅导记录）
2. 将采集到的数据提交给 EduFish 分析引擎
3. 监控分析任务状态，确认分析完成

工作流程（严格按顺序执行）：
- 第一步：调用 `collect_edu_data` 采集指定课程和时间范围的学习数据
- 第二步：检查采集结果是否有效（至少有学生和成绩数据），如果数据不足则报告
- 第三步：调用 `trigger_edu_analysis` 将数据提交给分析引擎
- 第四步：调用 `check_edu_analysis_status` 确认分析任务已入队

输出规则：
- 始终报告采集到的数据量（课程数、学生数、成绩记录数等）
- 如果数据为空或不足，说明原因并建议教师检查数据源
- 用中文回答，简洁清晰
"""


# Registry of all specialized agents
AGENT_CONFIGS: dict[str, AgentConfig] = {
    "tutor": AgentConfig(
        name="tutor",
        description="AI学习助手，回答学生关于课程内容的问题",
        system_prompt=_TUTOR_SYSTEM_PROMPT,
        tools=[
            "search_materials",
            "search_concept_graph",
            "get_chapter",
            "list_chapters",
            "get_quiz_items_for_chapter",
        ],
        temperature=0.7,
        max_iterations=8,
    ),
    "document-analyst": AgentConfig(
        name="document-analyst",
        description="从课程材料中提取概念、关系、题目",
        system_prompt=_DOCUMENT_ANALYST_SYSTEM_PROMPT,
        tools=[
            "search_materials",
            "search_concept_graph",
        ],
        temperature=0.3,
        max_iterations=5,
    ),
    "graph-explorer": AgentConfig(
        name="graph-explorer",
        description="知识图谱导览员",
        system_prompt=_GRAPH_EXPLORER_SYSTEM_PROMPT,
        tools=[
            "search_concept_graph",
            "list_chapters",
            "search_materials",
        ],
        temperature=0.5,
        max_iterations=6,
    ),
    "edu-collector": AgentConfig(
        name="edu-collector",
        description="全局感知 Agent：自动采集学生学习数据并触发 EduFish 教学质量分析",
        system_prompt=_EDU_COLLECTOR_SYSTEM_PROMPT,
        tools=[
            "collect_edu_data",
            "trigger_edu_analysis",
            "check_edu_analysis_status",
        ],
        temperature=0.2,
        max_iterations=5,
    ),
}


def get_agent(name: str) -> Agent | None:
    """Look up an agent by name."""
    config = AGENT_CONFIGS.get(name)
    if config is None:
        return None
    return Agent(config)


def list_agents() -> list[dict]:
    """Return metadata for all registered agents."""
    return [
        {
            "name": cfg.name,
            "description": cfg.description,
            "tools": cfg.tools,
        }
        for cfg in AGENT_CONFIGS.values()
    ]
