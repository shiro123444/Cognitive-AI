"""Engine Layer — Agent, RAG, Tools, Session.

This layer builds on the AI protocol layer to provide:
- Tool-calling agent loop (consumes EventStream, executes tools, loops)
- RAG pipeline (embed → search → context injection)
- Session management (conversation history, compaction)
- Tool registry (declarative tools with handlers)
"""
