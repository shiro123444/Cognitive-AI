"""ask command — Single-turn question answering.

Demonstrates the full pipeline:
1. Load config → build Model
2. Create Agent with tutor config
3. Stream events → render to terminal

This is the "hello world" of the SDK architecture.
"""

from __future__ import annotations

from rich.console import Console

from ..config import get_model_from_config, load_config
from ..tui import StreamRenderer, print_citations
from ...ai import Model
from ...engine.agent import Agent, AgentConfig

console = Console()

# Tutor system prompt (simplified version for CLI)
_TUTOR_PROMPT = """你是一个专业的AI学习助手，为人工智能导论和脑与认知科学导论课程提供辅导。

你的职责：
1. 回答学生关于课程内容的问题
2. 解释概念，举出例子
3. 引导学生思考，而不是直接给答案
4. 基于检索到的材料进行回答，不要凭空发挥

回答规则：
- 如果有检索到的材料，基于材料回答并引用来源
- 如果材料不足，诚实说明
- 用中文回答，简洁清晰
- 适当使用 markdown 格式
"""


async def run_ask(
    question: str,
    course: str | None = None,
    chapter: str | None = None,
    no_rag: bool = False,
) -> None:
    """Execute the ask command."""
    config = load_config()
    model = get_model_from_config(config)

    # Determine which tools to use
    tools = []
    if not no_rag:
        tools = ["search_materials", "search_concept_graph"]

    agent_config = AgentConfig(
        name="tutor",
        system_prompt=_TUTOR_PROMPT,
        tools=tools,
        model=model,
        temperature=0.7,
        max_iterations=5,
    )

    agent = Agent(config=agent_config)

    # Context variables
    context_vars = {}
    if course:
        context_vars["course_id"] = course
    if chapter:
        context_vars["chapter_id"] = chapter

    # Stream and render
    renderer = StreamRenderer(show_tools=True)
    console.print(f"[dim]模型: {model.provider}/{model.id}[/dim]")
    console.print()

    answer = await renderer.render(agent.run(question, context_vars=context_vars))
