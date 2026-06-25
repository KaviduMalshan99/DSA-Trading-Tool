import asyncio
import json
from fastapi import WebSocket
from app.core.redis import get_redis


class ConnectionManager:
    def __init__(self):
        # Map of channel -> set of connected WebSockets
        self._subscriptions: dict[str, set[WebSocket]] = {}
        self._listener_tasks: dict[str, asyncio.Task] = {}

    async def subscribe(self, ws: WebSocket, channel: str):
        if channel not in self._subscriptions:
            self._subscriptions[channel] = set()
            self._listener_tasks[channel] = asyncio.create_task(
                self._redis_listener(channel)
            )
        self._subscriptions[channel].add(ws)

    async def unsubscribe(self, ws: WebSocket, channel: str):
        if channel in self._subscriptions:
            self._subscriptions[channel].discard(ws)
            if not self._subscriptions[channel]:
                self._listener_tasks[channel].cancel()
                del self._subscriptions[channel]
                del self._listener_tasks[channel]

    async def disconnect(self, ws: WebSocket):
        for channel in list(self._subscriptions):
            await self.unsubscribe(ws, channel)

    async def broadcast(self, channel: str, message: str):
        dead: set[WebSocket] = set()
        for ws in self._subscriptions.get(channel, set()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            await self.unsubscribe(ws, channel)

    async def _redis_listener(self, channel: str):
        r = await get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await self.broadcast(channel, message["data"])
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)


manager = ConnectionManager()
