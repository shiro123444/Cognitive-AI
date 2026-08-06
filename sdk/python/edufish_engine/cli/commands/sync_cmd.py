"""sync commands — Pull materials from platform, push progress back.

`sync pull` implements the full pipeline:
1. Fetch course metadata + materials list from platform API
2. Download material files to ~/.edufish/cache/{course}/
3. Chunk and embed documents
4. Build local ChromaDB vector index
5. Cache knowledge graph data
"""

from __future__ import annotations

import json
from pathlib import Path

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from ..config import load_config
from .. import get_cache_dir

console = Console()


async def run_sync_pull(course: str) -> None:
    """Pull course materials from the web platform to local cache."""
    config = load_config()
    platform_url = config.get("platform", {}).get("url", "")
    platform_key = config.get("platform", {}).get("api_key", "")

    if not platform_url:
        console.print("[red]错误: 未配置平台 URL[/red]")
        console.print("[dim]运行: edufish config 查看配置[/dim]")
        console.print("[dim]编辑 ~/.edufish/config.toml 添加 platform.url[/dim]")
        return

    from ...sync.client import PlatformClient

    client = PlatformClient(base_url=platform_url, api_key=platform_key)
    cache_dir = get_cache_dir() / course
    cache_dir.mkdir(parents=True, exist_ok=True)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        # Step 1: Fetch course info
        task = progress.add_task("获取课程信息...", total=None)
        try:
            course_info = client.get_course(course)
            progress.update(task, description=f"课程: {course_info.get('title', course)}")
        except Exception as exc:
            progress.stop()
            console.print(f"[red]获取课程失败: {exc}[/red]")
            return

        # Step 2: Fetch and cache knowledge graph
        progress.update(task, description="同步知识图谱...")
        try:
            graph = client.get_graph(course)
            graph_path = cache_dir / "graph.json"
            graph_path.write_text(json.dumps(graph, ensure_ascii=False, indent=2))
            node_count = len(graph.get("nodes", []))
            edge_count = len(graph.get("edges", []))
            progress.update(task, description=f"知识图谱: {node_count} 概念, {edge_count} 关系")
        except Exception as exc:
            console.print(f"[yellow]知识图谱同步失败 (非致命): {exc}[/yellow]")
            graph = {"nodes": [], "edges": []}

        # Step 3: Fetch chapters
        progress.update(task, description="同步章节...")
        try:
            chapters = client.list_chapters(course)
            chapters_path = cache_dir / "chapters.json"
            chapters_path.write_text(json.dumps(chapters, ensure_ascii=False, indent=2))
            progress.update(task, description=f"章节: {len(chapters)} 个")
        except Exception as exc:
            console.print(f"[yellow]章节同步失败 (非致命): {exc}[/yellow]")
            chapters = []

        # Step 4: Fetch materials list
        progress.update(task, description="获取材料列表...")
        try:
            materials = client.list_materials(course)
            progress.update(task, description=f"材料: {len(materials)} 个")
        except Exception as exc:
            progress.stop()
            console.print(f"[red]获取材料列表失败: {exc}[/red]")
            return

        # Step 5: Build vector index
        progress.update(task, description="构建向量索引...")
        rag_config = config.get("rag", {})
        try:
            from ...engine.rag import Embedder, VectorStore, RAGPipeline

            embedder = Embedder(
                base_url=rag_config.get("embedding_base_url", "http://localhost:11434/v1"),
                api_key=rag_config.get("embedding_api_key", ""),
                model=rag_config.get("embedding_model", "nomic-embed-text"),
            )
            store = VectorStore(persist_dir=str(cache_dir / "vectordb"))
            pipeline = RAGPipeline(embedder=embedder, store=store)

            # Index chapters as documents
            total_chunks = 0
            for chapter in chapters:
                text = f"# {chapter.get('title', '')}\n\n"
                if chapter.get("objectives"):
                    text += f"学习目标: {chapter['objectives']}\n\n"
                if chapter.get("body"):
                    text += chapter["body"]

                if text.strip():
                    count = pipeline.ingest(
                        text=text,
                        source_id=chapter.get("id", ""),
                        course_id=course,
                    )
                    total_chunks += count

            progress.update(task, description=f"索引完成: {total_chunks} 个文本块")

        except Exception as exc:
            console.print(f"[yellow]向量索引构建失败: {exc}[/yellow]")
            console.print("[dim]提示: 确保 embedding 服务可用 (如 ollama pull nomic-embed-text)[/dim]")
            total_chunks = 0

        progress.update(task, description="✓ 同步完成")

    # Summary
    console.print()
    console.print(f"[bold green]✓ 课程 {course} 同步完成[/bold green]")
    console.print(f"  缓存目录: {cache_dir}")
    console.print(f"  知识图谱: {node_count} 概念, {edge_count} 关系")
    console.print(f"  章节: {len(chapters)} 个")
    console.print(f"  向量索引: {total_chunks} 个文本块")
    console.print()
    console.print("[dim]现在可以使用 `edufish ask` 或 `edufish chat` 进行本地学习[/dim]")


async def run_sync_push() -> None:
    """Push local learning progress to the platform."""
    config = load_config()
    platform_url = config.get("platform", {}).get("url", "")
    platform_key = config.get("platform", {}).get("api_key", "")

    if not platform_url:
        console.print("[red]错误: 未配置平台 URL[/red]")
        return

    from ...sync.client import PlatformClient
    from .. import get_sessions_dir

    sessions_dir = get_sessions_dir()
    session_files = list(sessions_dir.glob("*.json"))

    if not session_files:
        console.print("[dim]没有本地会话记录需要上报[/dim]")
        return

    console.print(f"[bold]上报学习进度[/bold] ({len(session_files)} 个会话)")

    client = PlatformClient(base_url=platform_url, api_key=platform_key)

    # Extract progress events from sessions
    events = []
    for session_file in session_files:
        try:
            data = json.loads(session_file.read_text())
            meta = data.get("meta", {})
            events.append({
                "event_type": "study_session",
                "course_id": meta.get("course_id", ""),
                "metadata": {
                    "session_id": meta.get("id", ""),
                    "message_count": meta.get("message_count", 0),
                    "title": meta.get("title", ""),
                    "duration_estimate": meta.get("message_count", 0) * 30,  # ~30s per message
                },
            })
        except Exception:
            continue

    if events:
        try:
            result = client.push_progress_events(events)
            console.print(f"[green]✓ 已上报 {len(events)} 条学习记录[/green]")
        except Exception as exc:
            console.print(f"[red]上报失败: {exc}[/red]")
    else:
        console.print("[dim]没有有效的学习记录[/dim]")
