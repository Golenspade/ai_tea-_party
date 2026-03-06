"""
routes.ws — WebSocket 路由

负责 WebSocket 连接管理和房间事件广播。
只广播 final messages, character updates, room status — 不广播 token delta。
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from models.character import Message

logger = logging.getLogger(__name__)

router = APIRouter()


class WebSocketManager:
    """WebSocket 连接管理器 — 管理房间级别的连接和广播。"""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str) -> None:
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str) -> None:
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)

    async def broadcast_message(self, room_id: str, message: Message) -> None:
        """广播新消息。"""
        await self._broadcast_to_room(
            room_id,
            {
                "type": "new_message",
                "message": {
                    "id": message.id,
                    "character_id": message.character_id,
                    "character_name": message.character_name,
                    "content": message.content,
                    "timestamp": message.timestamp.isoformat(),
                    "is_system": message.is_system,
                },
            },
        )

    async def broadcast_character_update(
        self, room_id: str, action: str, character_data: dict
    ) -> None:
        """广播角色更新（added / removed）。"""
        await self._broadcast_to_room(
            room_id,
            {"type": "character_update", "action": action, "character": character_data},
        )

    async def broadcast_room_status(self, room_id: str, status: dict) -> None:
        """广播房间状态变更。"""
        await self._broadcast_to_room(
            room_id,
            {"type": "room_status", **status},
        )

    async def _broadcast_to_room(self, room_id: str, data: dict) -> None:
        if room_id not in self.active_connections:
            return

        disconnected = []
        for websocket in self.active_connections[room_id]:
            try:
                await websocket.send_json(data)
            except Exception as e:
                logger.warning(f"发送 WebSocket 消息失败: {e}")
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket, room_id)

    def get_room_connection_count(self, room_id: str) -> int:
        return len(self.active_connections.get(room_id, []))


# 全局实例
ws_manager = WebSocketManager()


def setup_ws_routes(ws_manager_instance: WebSocketManager) -> APIRouter:
    """设置 WebSocket 路由。"""

    @router.websocket("/ws/{room_id}")
    async def websocket_endpoint(websocket: WebSocket, room_id: str):
        await ws_manager_instance.connect(websocket, room_id)
        try:
            while True:
                data = await websocket.receive_json()
                logger.debug(f"收到 WS 消息: {data}")
        except WebSocketDisconnect:
            ws_manager_instance.disconnect(websocket, room_id)
        except Exception:
            ws_manager_instance.disconnect(websocket, room_id)

    return router
