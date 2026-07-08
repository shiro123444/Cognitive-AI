"""EventStream — The unified async iteration protocol.

Directly inspired by pi's EventStream<T, R> class.
Any LLM interaction returns an EventStream. Consumers iterate over events
and can await the final result.

This is what makes "one engine, multiple interfaces" possible:
- CLI: async for event in stream: render_to_terminal(event)
- Web: async for event in stream: yield sse_format(event)
- Test: result = await stream.result()
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

from . import AssistantMessage, DoneEvent, ErrorEvent, Event


class EventStream:
    """Async iterable stream of LLM events with a final result promise.

    Usage:
        stream = provider.stream(model, context)

        # Consume events (streaming)
        async for event in stream:
            if event.type == "text_delta":
                print(event.delta, end="")

        # Or just get the final result
        message = await stream.result()
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[Event | None] = asyncio.Queue()
        self._done = False
        self._result_future: asyncio.Future[AssistantMessage] = asyncio.get_event_loop().create_future()

    def push(self, event: Event) -> None:
        """Push an event into the stream (called by providers)."""
        if self._done:
            return

        if isinstance(event, DoneEvent):
            self._done = True
            if event.message and not self._result_future.done():
                self._result_future.set_result(event.message)
        elif isinstance(event, ErrorEvent):
            self._done = True
            if event.message and not self._result_future.done():
                self._result_future.set_result(event.message)

        self._queue.put_nowait(event)
        if self._done:
            self._queue.put_nowait(None)  # Sentinel

    def end(self, message: AssistantMessage | None = None) -> None:
        """Terminate the stream (convenience for providers)."""
        if message:
            self.push(DoneEvent(message=message, stop_reason=message.stop_reason))
        else:
            self._done = True
            self._queue.put_nowait(None)

    def error(self, error_message: str, message: AssistantMessage | None = None) -> None:
        """Terminate the stream with an error."""
        self.push(ErrorEvent(error_message=error_message, message=message))

    async def __aiter__(self) -> AsyncIterator[Event]:
        """Async iteration over events."""
        while True:
            item = await self._queue.get()
            if item is None:
                return
            yield item

    async def result(self) -> AssistantMessage:
        """Await the final AssistantMessage (blocks until stream completes)."""
        return await self._result_future

    def result_sync(self) -> AssistantMessage:
        """Synchronous result (for non-async contexts). Drains the stream."""
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self.result())
        finally:
            loop.close()


class SyncEventStream:
    """Synchronous version for Flask/WSGI contexts.

    Same protocol, but uses a thread-safe queue and regular iteration.
    This is what the web adapter uses.
    """

    def __init__(self) -> None:
        import queue

        self._queue: queue.Queue[Event | None] = queue.Queue()
        self._done = False
        self._final_message: AssistantMessage | None = None

    def push(self, event: Event) -> None:
        """Push an event into the stream."""
        if self._done:
            return

        if isinstance(event, DoneEvent):
            self._done = True
            self._final_message = event.message
        elif isinstance(event, ErrorEvent):
            self._done = True
            self._final_message = event.message

        self._queue.put(event)
        if self._done:
            self._queue.put(None)

    def __iter__(self):
        """Synchronous iteration over events."""
        while True:
            item = self._queue.get()
            if item is None:
                return
            yield item

    def result(self) -> AssistantMessage | None:
        """Get the final message (only available after iteration completes)."""
        return self._final_message
