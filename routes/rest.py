"""
routes.rest — REST API 路由

消息 CRUD、角色 CRUD、房间 CRUD、API 配置管理。
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.character import Character, Message
from services.chat_service import ChatService
from services.orchestrator import ChatOrchestrator
from routes.ws import WebSocketManager

logger = logging.getLogger(__name__)

router = APIRouter()


# ------------------------------------------------------------------
# 请求模型
# ------------------------------------------------------------------


class MessageRequest(BaseModel):
    character_id: str
    content: str


class CharacterRequest(BaseModel):
    name: str
    personality: str
    background: str
    speaking_style: Optional[str] = ""


class APIConfigRequest(BaseModel):
    provider: str
    api_key: str
    model: Optional[str] = None


class CreateRoomRequest(BaseModel):
    name: str
    description: str = ""
    stealth_mode: bool = False
    user_description: str = ""


class UpdateRoomRequest(BaseModel):
    stealth_mode: Optional[bool] = None
    user_description: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


# ------------------------------------------------------------------
# 模型 ID 映射（前端发送的 provider key → 实际 model_id）
# ------------------------------------------------------------------

PROVIDER_TO_MODEL: dict[str, str] = {
    "deepseek_chat": "deepseek-chat",
    "deepseek_reasoner": "deepseek-reasoner",
    "gemini_25_flash": "gemini-2.5-flash",
    "gemini_25_pro": "gemini-2.5-pro",
    "gemini_3_flash": "gemini-3-flash-preview",
    "gemini_31_pro": "gemini-3.1-pro-preview",
    "gemini_31_flash_lite": "gemini-3.1-flash-lite-preview",
}

# 模型描述（给前端 UI 使用）
MODEL_DESCRIPTIONS: dict[str, dict] = {
    "deepseek_chat": {
        "name": "DeepSeek Chat",
        "models": ["deepseek-chat"],
        "requires_key": "DEEPSEEK_API_KEY",
        "description": "DeepSeek V3.2 聊天模型，适合日常对话",
    },
    "deepseek_reasoner": {
        "name": "DeepSeek Reasoner",
        "models": ["deepseek-reasoner"],
        "requires_key": "DEEPSEEK_API_KEY",
        "description": "DeepSeek V3.2 推理模型，具有更强的逻辑推理能力",
    },
    "gemini_25_flash": {
        "name": "Gemini 2.5 Flash",
        "models": ["gemini-2.5-flash"],
        "requires_key": "GEMINI_API_KEY",
        "description": "Google Gemini 2.5 Flash，快速且高效",
    },
    "gemini_25_pro": {
        "name": "Gemini 2.5 Pro",
        "models": ["gemini-2.5-pro"],
        "requires_key": "GEMINI_API_KEY",
        "description": "Google Gemini 2.5 Pro，强大的理解和推理能力",
    },
    "gemini_3_flash": {
        "name": "Gemini 3 Flash",
        "models": ["gemini-3-flash-preview"],
        "requires_key": "GEMINI_API_KEY",
        "description": "Google Gemini 3 Flash，前沿性能，速度快成本低",
    },
    "gemini_31_pro": {
        "name": "Gemini 3.1 Pro",
        "models": ["gemini-3.1-pro-preview"],
        "requires_key": "GEMINI_API_KEY",
        "description": "Google Gemini 3.1 Pro，最强推理和编程能力",
    },
    "gemini_31_flash_lite": {
        "name": "Gemini 3.1 Flash Lite",
        "models": ["gemini-3.1-flash-lite-preview"],
        "requires_key": "GEMINI_API_KEY",
        "description": "Google Gemini 3.1 Flash Lite，高性价比的轻量模型",
    },
}


def setup_rest_routes(
    orchestrator: ChatOrchestrator,
    chat_service: ChatService,
    ws_manager: WebSocketManager,
    default_room_id: str = "default",
) -> APIRouter:
    """设置 REST 路由。"""

    # ==================================================================
    # 角色
    # ==================================================================

    @router.get("/api/rooms/{room_id}/characters")
    async def get_characters(room_id: str):
        room = chat_service.get_chat_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="聊天室不存在")
        return [
            {
                "id": c.id,
                "name": c.name,
                "personality": c.personality,
                "background": c.background,
                "speaking_style": c.speaking_style,
                "is_active": c.is_active,
            }
            for c in room.characters
        ]

    @router.post("/api/characters")
    async def create_character_globally(data: CharacterRequest):
        if not orchestrator.is_configured():
            raise HTTPException(status_code=400, detail="AI服务未配置")
        character = Character(
            name=data.name,
            personality=data.personality,
            background=data.background,
            speaking_style=data.speaking_style or "",
        )
        success = chat_service.add_character_to_room(default_room_id, character)
        if not success:
            raise HTTPException(status_code=500, detail="无法将角色添加到默认聊天室")
        await ws_manager.broadcast_character_update(
            default_room_id, "added", character.model_dump()
        )
        return character

    @router.post("/api/rooms/{room_id}/characters")
    async def add_character(room_id: str, data: CharacterRequest):
        if not orchestrator.is_configured():
            raise HTTPException(status_code=400, detail="AI服务未配置")
        character = Character(
            name=data.name,
            personality=data.personality,
            background=data.background,
            speaking_style=data.speaking_style or "",
        )
        success = chat_service.add_character_to_room(room_id, character)
        if not success:
            raise HTTPException(status_code=404, detail="聊天室不存在")
        await ws_manager.broadcast_character_update(
            room_id,
            "added",
            {
                "id": character.id,
                "name": character.name,
                "personality": character.personality,
                "background": character.background,
                "speaking_style": character.speaking_style,
                "is_active": character.is_active,
            },
        )
        return {"message": "角色添加成功", "character_id": character.id}

    @router.delete("/api/rooms/{room_id}/characters/{character_id}")
    async def remove_character(room_id: str, character_id: str):
        success = chat_service.remove_character_from_room(room_id, character_id)
        if not success:
            raise HTTPException(status_code=404, detail="聊天室或角色不存在")
        await ws_manager.broadcast_character_update(
            room_id, "removed", {"id": character_id}
        )
        return {"message": "角色移除成功"}

    # ==================================================================
    # 消息
    # ==================================================================

    @router.get("/api/rooms/{room_id}/messages")
    async def get_messages(room_id: str, limit: int = 50, since: Optional[str] = None):
        """获取消息。支持 since 参数用于 WS 重连后补齐。"""
        room = chat_service.get_chat_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="聊天室不存在")
        messages = room.get_recent_messages(limit)
        return [
            {
                "id": msg.id,
                "character_id": msg.character_id,
                "character_name": msg.character_name,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "is_system": msg.is_system,
            }
            for msg in messages
        ]

    @router.post("/api/rooms/{room_id}/messages")
    async def send_message(room_id: str, data: MessageRequest):
        success = await chat_service.send_message(
            room_id, data.character_id, data.content
        )
        if not success:
            raise HTTPException(status_code=404, detail="聊天室或角色不存在")
        return {"message": "消息发送成功"}

    @router.delete("/api/rooms/{room_id}/messages")
    async def clear_messages(room_id: str):
        room = chat_service.get_chat_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="聊天室不存在")
        room.messages.clear()
        # 同步清空数据库
        from db import repository as db_repo
        await db_repo.clear_messages(room_id)
        system_msg = Message(
            character_id="system",
            character_name="系统",
            content="聊天记录已清空",
            is_system=True,
        )
        room.add_message(system_msg)
        await db_repo.save_message(system_msg, room_id)
        await ws_manager.broadcast_message(room_id, system_msg)
        return {"message": "聊天记录已清空"}

    # ==================================================================
    # 自动聊天
    # ==================================================================

    @router.post("/api/rooms/{room_id}/auto-chat/start")
    async def start_auto_chat(room_id: str):
        if not orchestrator.is_configured():
            raise HTTPException(status_code=400, detail="AI服务未配置")
        interval = int(os.getenv("AUTO_CHAT_INTERVAL", "5"))
        chat_service.start_auto_chat(room_id, interval)
        await ws_manager.broadcast_room_status(room_id, {"is_auto_chat": True})
        return {"message": "自动聊天已开始"}

    @router.post("/api/rooms/{room_id}/auto-chat/stop")
    async def stop_auto_chat(room_id: str):
        chat_service.stop_auto_chat(room_id)
        await ws_manager.broadcast_room_status(room_id, {"is_auto_chat": False})
        return {"message": "自动聊天已停止"}

    # ==================================================================
    # 配置与状态
    # ==================================================================

    @router.get("/api/health")
    async def health_check():
        return {
            "status": "healthy",
            "ai_configured": orchestrator.is_configured(),
            "rooms": len(chat_service.chat_rooms),
            "connections": sum(
                ws_manager.get_room_connection_count(rid)
                for rid in ws_manager.active_connections
            ),
        }

    @router.get("/api/config")
    async def get_api_config():
        return {
            "current_config": orchestrator.get_current_config(),
            "available_providers": MODEL_DESCRIPTIONS,
        }

    @router.post("/api/config")
    async def update_api_config(config: APIConfigRequest):
        if config.provider not in PROVIDER_TO_MODEL:
            available = ", ".join(PROVIDER_TO_MODEL.keys())
            raise HTTPException(
                status_code=400,
                detail=f"不支持的API提供商: {config.provider}。支持: {available}",
            )

        model_id = config.model or PROVIDER_TO_MODEL[config.provider]

        # 使用 LiteLLM 统一 Provider 重新注册
        from core.llm.providers.litellm_provider import LiteLLMProvider, ModelConfig
        from core.llm import ModelCapabilities

        models: dict[str, ModelConfig] = {}

        if config.provider.startswith("deepseek"):
            for mid in ["deepseek-chat", "deepseek-reasoner"]:
                models[mid] = ModelConfig(
                    litellm_model=f"deepseek/{mid}",
                    api_key=config.api_key,
                    capabilities=ModelCapabilities(max_context_tokens=128_000),
                )
        elif config.provider.startswith("gemini"):
            gemini_models = {
                "gemini-2.5-flash": "gemini/gemini-2.5-flash",
                "gemini-2.5-pro": "gemini/gemini-2.5-pro",
                "gemini-3-flash-preview": "gemini/gemini-3-flash-preview",
                "gemini-3.1-pro-preview": "gemini/gemini-3.1-pro-preview",
                "gemini-3.1-flash-lite-preview": "gemini/gemini-3.1-flash-lite-preview",
            }
            for mid, litellm_name in gemini_models.items():
                models[mid] = ModelConfig(
                    litellm_model=litellm_name,
                    api_key=config.api_key,
                    capabilities=ModelCapabilities(max_context_tokens=1_000_000),
                )

        if models:
            orchestrator.registry.register(LiteLLMProvider(models=models))

        orchestrator.update_model(model_id)

        # 测试连接
        test_result = await orchestrator.test_connection()

        return {
            "message": "API配置更新成功",
            "config": orchestrator.get_current_config(),
            "test_result": test_result,
        }

    @router.post("/api/test-connection")
    async def test_api_connection():
        try:
            result = await orchestrator.test_connection()
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"连接测试失败: {e}")

    @router.get("/api/status")
    async def get_api_status():
        config = orchestrator.get_current_config()
        if not config:
            return {"status": "not_configured", "message": "API未配置"}
        return {
            "status": "configured",
            "provider": config["provider"],
            "model": config["model"],
        }

    # ==================================================================
    # 房间
    # ==================================================================

    @router.post("/api/rooms")
    async def create_room(request: CreateRoomRequest):
        room = chat_service.create_chat_room(
            name=request.name,
            description=request.description,
            stealth_mode=request.stealth_mode,
            user_description=request.user_description,
        )
        return {
            "status": "success",
            "room": {
                "id": room.id,
                "name": room.name,
                "description": room.description,
                "stealth_mode": room.stealth_mode,
                "user_description": room.user_description,
                "character_count": len(room.characters),
                "created_at": room.created_at.isoformat(),
            },
        }

    @router.get("/api/rooms")
    async def get_rooms():
        rooms = chat_service.get_all_chat_rooms()
        return {
            "status": "success",
            "rooms": [
                {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description,
                    "stealth_mode": room.stealth_mode,
                    "user_description": room.user_description,
                    "character_count": len(room.characters),
                    "message_count": len(room.messages),
                    "is_auto_chat": room.is_auto_chat,
                    "created_at": room.created_at.isoformat(),
                    "characters": [
                        {
                            "id": c.id,
                            "name": c.name,
                            "personality": c.personality,
                            "is_active": c.is_active,
                        }
                        for c in room.characters
                    ],
                }
                for room in rooms
            ],
        }

    @router.put("/api/rooms/{room_id}")
    async def update_room(room_id: str, request: UpdateRoomRequest):
        success = chat_service.update_room_settings(
            room_id=room_id,
            stealth_mode=request.stealth_mode,
            user_description=request.user_description,
            name=request.name,
            description=request.description,
        )
        if not success:
            raise HTTPException(status_code=404, detail="聊天室不存在")
        return {"status": "success", "message": "聊天室设置已更新"}

    return router
