"""chat command — Interactive multi-turn conversation.

Like pi's interactive mode: a REPL that maintains session state,
supports compaction, and streams responses.
"""

from __future__ import annotations

import time
import uuid

from rich.console import Console

from ..config import get_model_from_config, load_config
from ..tui import StreamRenderer
from ...ai import Model
from ...engine.agent import Agent, AgentConfig
from ...engine.session import Session, SessionMeta
from .. import get_sessions_dir

console = Console()

_TUTOR_PROMPT = """你是一个专业的AI学习助手。你正在与学生进行多轮对话。

你的职责：
1. 回答学生关于课程内容的问题
2. 记住对话上下文，保持连贯性
3. 引导学生深入思考
4. 基于检索到的材料进行回答

回答规则：
- 用中文回答，简洁清晰
- 适当使用 markdown 格式
- 如果学生的问题与之前的对话相关，引用之前的内容
"""


async def run_chat(course: str | None = None, session_id: str | None = None) -> None:
    """Interactive chat REPL."""
    config = load_config()
    model = get_model_from_config(config)

    # Load or create session
    sessions_dir = get_sessions_dir()
    if session_id:
        session_path = sessions_dir / f"{session_id}.json"
        if session_path.exists():
            session = Session.load(session_path)
            console.print(f"[dim]恢复会话: {session.meta.title}[/dim]")
        else:
            console.print(f"[red]会话 {session_id} 不存在[/red]")
            return
    else:
        session = Session(meta=SessionMeta(
            id=str(uuid.uuid4())[:8],
            course_id=course or "",
            created_at=time.time(),
        ))

    agent_config = AgentConfig(
        name="tutor",
        system_prompt=_TUTOR_PROMPT,
        tools=["search_materials", "search_concept_graph"],
        model=model,
        temperature=0.7,
        max_iterations=5,
    )

    console.print(f"[bold]EduFish Chat[/bold] [dim](模型: {model.provider}/{model.id})[/dim]")
    if course:
        console.print(f"[dim]课程: {course}[/dim]")
    console.print("[dim]输入 /quit 退出, /save 保存会话, /clear 清空历史[/dim]")
    console.print()

    renderer = StreamRenderer(show_tools=True)

    while True:
        try:
            user_input = console.input("[bold green]你> [/bold green]")
        except (EOFError, KeyboardInterrupt):
            break

        user_input = user_input.strip()
        if not user_input:
            continue

        # Slash commands
        if user_input == "/quit":
            break
        elif user_input == "/save":
            path = sessions_dir / f"{session.meta.id}.json"
            session.save(path)
            console.print(f"[green]会话已保存: {path}[/green]")
            continue
        elif user_input == "/clear":
            session.messages.clear()
            session.compaction_summary = ""
            console.print("[dim]历史已清空[/dim]")
            continue
        elif user_input == "/history":
            console.print(f"[dim]消息数: {len(session.messages)}, 压缩次数: {session.meta.compaction_count}[/dim]")
            continue

        # Add to session
        session.add_user_message(user_input)

        # Check compaction
        if session.should_compact(model):
            console.print("[dim]⚡ 上下文接近限制，正在压缩历史...[/dim]")
            # TODO: Use LLM to generate summary
            summary = f"之前讨论了 {session.meta.message_count} 条消息的内容。"
            session.compact(summary)

        # Build context vars from session
        context_vars = {}
        if session.meta.course_id:
            context_vars["course_id"] = session.meta.course_id
        session_context = session.build_system_context()
        if session_context:
            context_vars["session_context"] = session_context

        # Run agent
        agent = Agent(config=agent_config)
        console.print()

        answer = await renderer.render(agent.run(user_input, context_vars=context_vars))

        # Add response to session
        from ...ai import AssistantMessage, TextContent
        session.add_assistant_message(AssistantMessage(
            content=[TextContent(text=answer)],
            timestamp=time.time(),
        ))

        console.print()

    # Auto-save on exit
    if session.meta.message_count > 0:
        path = sessions_dir / f"{session.meta.id}.json"
        session.save(path)
        console.print(f"\n[dim]会话已自动保存: {session.meta.id}[/dim]")
