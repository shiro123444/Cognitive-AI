"""CLI entry point — the main command dispatcher.

Uses click for command routing and rich for terminal rendering.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import click

from . import get_config_dir
from .config import load_config


@click.group()
@click.version_option(package_name="edufish-engine")
@click.pass_context
def cli(ctx):
    """EduFish — 本地AI学习助手"""
    ctx.ensure_object(dict)
    ctx.obj["config"] = load_config()


@cli.command()
@click.argument("question")
@click.option("--course", "-c", default=None, help="课程 ID (如 ai-intro)")
@click.option("--chapter", default=None, help="章节 ID")
@click.option("--no-rag", is_flag=True, help="跳过 RAG 检索，直接问 LLM")
def ask(question: str, course: str | None, chapter: str | None, no_rag: bool):
    """向 AI 助手提问（单轮）"""
    from .commands.ask import run_ask

    asyncio.run(run_ask(question, course=course, chapter=chapter, no_rag=no_rag))


@cli.command()
@click.option("--course", "-c", default=None, help="课程 ID")
@click.option("--session-id", "-s", default=None, help="恢复已有会话")
def chat(course: str | None, session_id: str | None):
    """进入交互式对话模式"""
    from .commands.chat import run_chat

    asyncio.run(run_chat(course=course, session_id=session_id))


@cli.command()
@click.argument("concept")
@click.option("--course", "-c", default=None, help="课程 ID")
def graph(concept: str, course: str | None):
    """探索知识图谱中的概念关系"""
    from .commands.graph import run_graph

    asyncio.run(run_graph(concept, course=course))


@cli.group()
def sync():
    """与平台同步课程材料和学习进度"""
    pass


@sync.command("pull")
@click.option("--course", "-c", required=True, help="课程 ID")
def sync_pull(course: str):
    """从平台拉取课程材料到本地"""
    from .commands.sync_cmd import run_sync_pull

    asyncio.run(run_sync_pull(course))


@sync.command("push")
def sync_push():
    """上报本地学习进度到平台"""
    from .commands.sync_cmd import run_sync_push

    asyncio.run(run_sync_push())


@cli.command()
def config():
    """查看/编辑本地配置"""
    cfg = load_config()
    click.echo(f"配置文件: {get_config_dir() / 'config.toml'}")
    click.echo(f"LLM Provider: {cfg.get('llm', {}).get('provider', '未配置')}")
    click.echo(f"LLM Model: {cfg.get('llm', {}).get('model', '未配置')}")
    click.echo(f"Platform URL: {cfg.get('platform', {}).get('url', '未配置')}")


def main():
    """Entry point for `edufish` command."""
    cli()


if __name__ == "__main__":
    main()
