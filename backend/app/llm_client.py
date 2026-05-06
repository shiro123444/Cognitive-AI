"""OpenAI-compatible LLM client.

Works with any OpenAI-compatible chat completion endpoint:
- OpenAI, Anthropic (via compatible endpoint), NVIDIA NIM
- Local servers (Ollama, vLLM, LM Studio, etc.)
"""

from __future__ import annotations

from openai import OpenAI

from .url_rewrite import rewrite_base_url


class LLMClient:
    """Thin wrapper around OpenAI SDK for chat completions."""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float | None = None) -> None:
        kwargs = {"base_url": rewrite_base_url(base_url), "api_key": api_key}
        if timeout is not None:
            kwargs["timeout"] = timeout
        self.client = OpenAI(**kwargs)
        self.model = model

    def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        """Non-streaming chat completion."""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    def chat_json(
        self,
        messages: list[dict],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """Chat completion with JSON response format."""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""

    def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        """Streaming chat completion — yields text chunks."""
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
