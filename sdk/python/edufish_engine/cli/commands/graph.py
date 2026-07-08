"""graph command — Explore the knowledge graph from terminal."""

from __future__ import annotations

from rich.console import Console
from rich.tree import Tree

console = Console()


async def run_graph(concept: str, course: str | None = None) -> None:
    """Explore concept relationships in the knowledge graph."""
    # TODO: Implement via sync client or local cache
    console.print(f"[bold]知识图谱探索: {concept}[/bold]")
    console.print("[dim]（需要先 `edufish sync pull` 同步课程数据）[/dim]")
    console.print()

    # Placeholder — will use sync client to fetch graph data
    tree = Tree(f"[bold cyan]{concept}[/bold cyan]")
    tree.add("[dim]前置知识[/dim]").add("（待同步）")
    tree.add("[dim]相关概念[/dim]").add("（待同步）")
    tree.add("[dim]后续概念[/dim]").add("（待同步）")
    console.print(tree)
