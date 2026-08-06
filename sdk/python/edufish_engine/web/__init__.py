"""Web Adapter — Bridge between the engine and Flask/WSGI.

This is the thin layer that makes the existing Flask backend consume
the same engine as the CLI. It translates:
- Engine EventStream → Flask SSE Response
- Flask request → Engine Context

The goal: replace the current TutorService's manual LLM orchestration
with the unified engine, while keeping the same HTTP API contract.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from typing import Any, Generator

from ..ai import (
    AssistantMessage,
    Context,
    DoneEvent,
    ErrorEvent,
    Model,
    TextContent,
    TextDeltaEvent,
    ToolCall,
    ToolCallEndEvent,
    ToolCallStartEvent,
    UserMessage,
)
from ..ai.registry import stream_sync
from ..engine.agent import Agent, AgentConfig, AgentDoneEvent, ToolExecutingEvent, ToolResultEvent


def event_to_sse(event) -> str:
    """Convert an engine event to SSE format (matching existing frontend contract)."""
    if isinstance(event, TextDeltaEvent):
        payload = {"type": "token", "content": event.delta}
    elif isinstance(event, ToolCallStartEvent):
        payload = {"type": "tool_call", "content": {"name": event.name, "arguments": {}}}
    elif isinstance(event, ToolExecutingEvent):
        payload = {"type": "tool_call", "content": {"name": event.name, "arguments": event.arguments}}
    elif isinstance(event, ToolResultEvent):
        payload = {"type": "tool_result", "content": {"name": event.name, "result_preview": event.result_preview}}
    elif isinstance(event, AgentDoneEvent):
        payload = {"type": "answer", "content": event.answer}
    elif isinstance(event, ErrorEvent):
        payload = {"type": "error", "content": event.error_message}
    elif isinstance(event, DoneEvent):
        # Skip — AgentDoneEvent handles the final answer
        return ""
    else:
        # Forward other events as-is
        payload = {"type": getattr(event, "type", "unknown"), "content": ""}

    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def agent_stream_to_sse(
    agent: Agent,
    user_input: str,
    context_vars: dict[str, str] | None = None,
) -> Generator[str, None, None]:
    """Run an agent and yield SSE events.

    This is the main integration point for Flask routes.
    Replaces the old TutorService._rag_answer_stream() with the unified engine.

    Usage in Flask:
        @app.route("/api/v1/tutor/ask", methods=["POST"])
        def tutor_ask():
            agent = build_tutor_agent(request)
            return Response(
                agent_stream_to_sse(agent, question),
                mimetype="text/event-stream",
            )
    """
    import asyncio

    async def _collect_events():
        events = []
        async for event in agent.run(user_input, context_vars=context_vars):
            events.append(event)
        return events

    # Run async agent in a new event loop (Flask is sync)
    loop = asyncio.new_event_loop()
    try:
        events = loop.run_until_complete(_collect_events())
    finally:
        loop.close()

    for event in events:
        sse = event_to_sse(event)
        if sse:
            yield sse

    yield "data: [DONE]\n\n"


def build_model_from_flask_config(config: dict[str, Any]) -> Model:
    """Build a Model from Flask app.config (backward compatible)."""
    return Model(
        id=config.get("LLM_MODEL_NAME", ""),
        provider="openai-compatible",
        api="openai-compatible",
        base_url=config.get("LLM_BASE_URL", ""),
        api_key=config.get("LLM_API_KEY", ""),
    )


def build_tutor_agent(
    model: Model,
    course_id: str = "",
    tools: list[str] | None = None,
) -> Agent:
    """Build a tutor agent with the standard configuration.

    This replaces the old TutorService + Agent system with a single
    unified agent that uses the engine's tool-calling loop.
    """
    from ..engine.tools import registry

    system_prompt = """你是一个专业的AI学习助手，专门为人工智能导论和脑与认知科学导论课程提供辅导。

你的职责：
1. 回答学生关于课程内容的问题
2. 解释概念，举出例子
3. 引导学生思考，而不是直接给答案
4. 在合适的时候建议学习路径或相关章节

工具使用原则：
- 遇到具体内容问题，先用 `search_materials` 在材料中检索
- 涉及概念关系，用 `search_concept_graph` 查询知识图谱

回答规则：
- 基于检索到的材料和图谱进行回答，不要凭空发挥
- 如果材料不足，诚实说明并建议学生上传相关材料
- 适当引用来源（章节名、概念名）
- 用中文回答，简洁清晰
"""

    tool_names = tools or ["search_materials", "search_concept_graph"]

    config = AgentConfig(
        name="tutor",
        system_prompt=system_prompt,
        tools=tool_names,
        model=model,
        temperature=0.7,
        max_iterations=5,
    )

    return Agent(config=config, tool_registry=registry)


# ── Flask Blueprint (optional, for drop-in replacement) ──────────────────────


def create_engine_blueprint():
    """Create a Flask Blueprint that uses the engine instead of TutorService.

    This can be mounted alongside or as a replacement for the existing
    /api/v1/tutor routes.

    Usage:
        from edufish_engine.web import create_engine_blueprint
        app.register_blueprint(create_engine_blueprint(), url_prefix="/api/v2")
    """
    from flask import Blueprint, Response, current_app, request

    bp = Blueprint("engine", __name__)

    @bp.route("/tutor/ask", methods=["POST"])
    def tutor_ask():
        data = request.get_json(force=True)
        question = data.get("question", "")
        course_id = data.get("course_id", "")
        stream_mode = data.get("stream", True)

        if not question:
            return {"error": {"code": "MISSING_QUESTION", "message": "question is required"}}, 422

        model = build_model_from_flask_config(current_app.config)
        if not model.api_key:
            return {"error": {"code": "NO_API_KEY", "message": "LLM_API_KEY not configured"}}, 503

        agent = build_tutor_agent(model, course_id=course_id)
        context_vars = {"course_id": course_id} if course_id else None

        if stream_mode:
            return Response(
                agent_stream_to_sse(agent, question, context_vars=context_vars),
                mimetype="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        else:
            # Non-streaming: run to completion
            import asyncio
            loop = asyncio.new_event_loop()
            try:
                answer = loop.run_until_complete(agent.complete(question, context_vars=context_vars))
            finally:
                loop.close()
            return {"data": {"answer": answer}}

    return bp
