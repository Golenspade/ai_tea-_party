"""
routes.sse — SSE 流式生成路由

负责将 ChatEvent 流序列化为 Server-Sent Events。
路由层只做传输，不含业务逻辑。
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.chat_service import ChatService
from services.orchestrator import ChatOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter()


class GenerateRequest(BaseModel):
    character_id: str


def setup_sse_routes(
    orchestrator: ChatOrchestrator,
    chat_service: ChatService,
) -> APIRouter:
    """设置 SSE 路由。"""

    @router.post("/api/rooms/{room_id}/generate")
    async def generate_response(room_id: str, req: GenerateRequest):
        """非流式生成 AI 回复。"""
        if not orchestrator.is_configured():
            raise HTTPException(
                status_code=400,
                detail="AI服务未配置，请在设置中配置API密钥（支持DeepSeek或Gemini）",
            )

        room = chat_service.get_chat_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="聊天室不存在")

        character = next(
            (c for c in room.characters if c.id == req.character_id), None
        )
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")

        messages_for_ai = chat_service.prepare_messages_for_ai(room, character)
        result = await orchestrator.generate_non_stream(
            room, character, messages_for_ai
        )

        if result is None:
            raise HTTPException(status_code=500, detail="生成回复失败")

        return {"message": "回复生成成功", "content": result}

    @router.post("/api/rooms/{room_id}/generate/stream")
    async def stream_generate_response(room_id: str, req: GenerateRequest):
        """流式生成 AI 回复（SSE）。"""
        if not orchestrator.is_configured():
            raise HTTPException(
                status_code=400,
                detail="AI服务未配置，请在设置中配置API密钥（支持DeepSeek或Gemini）",
            )

        room = chat_service.get_chat_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="聊天室不存在")

        character = next(
            (c for c in room.characters if c.id == req.character_id), None
        )
        if not character:
            raise HTTPException(status_code=404, detail="角色不存在")

        messages_for_ai = chat_service.prepare_messages_for_ai(room, character)

        async def event_stream():
            async for event in orchestrator.generate(
                room, character, messages_for_ai
            ):
                yield f"data: {event.model_dump_json()}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    return router
