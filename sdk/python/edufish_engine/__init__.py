"""EduFish Engine SDK — 一套引擎，多种界面。

Architecture inspired by pi's layered design:
- ai/       协议层: provider-agnostic streaming abstraction
- engine/   引擎层: agent loop, RAG, tools, session
- sync/     同步层: platform API client, material cache
- cli/      应用层: terminal UI consuming the engine
"""

__version__ = "0.1.0"
