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

from db import repository as repo
from models.character import Character, ExampleDialogue, Message
from models.persona import Persona
from models.world_info import WIPosition, WorldInfoBook, WorldInfoEntry
from routes.ws import WebSocketManager
from services.chat_service import ChatService
from services.orchestrator import ChatOrchestrator

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
    # CharacterCard 扩展字段
    description: Optional[str] = ""
    scenario: Optional[str] = ""
    system_prompt_override: Optional[str] = ""
    post_instructions: Optional[str] = ""
    greeting: Optional[str] = ""
    creator_notes: Optional[str] = ""
    tags: Optional[list] = []
    example_dialogues: Optional[list] = []


class APIConfigRequest(BaseModel):
    provider: str
    api_key: str = ""
    model: Optional[str] = None
    api_base: Optional[str] = None


class SettingsRequest(BaseModel):
    response_length: str = "default"  # short / default / long

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


class PersonaRequest(BaseModel):
    name: str
    description: str = ""
    is_default: bool = False


class WorldInfoBookRequest(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True


class WorldInfoEntryRequest(BaseModel):
    keys: list
    content: str
    secondary_keys: list = []
    selective_logic: str = "AND"
    position: str = "after_char"
    depth: int = 4
    enabled: bool = True
    constant: bool = False
    order: int = 100


class RoomWorldInfoRequest(BaseModel):
    book_ids: list


# ------------------------------------------------------------------
# 通用 Provider 注册表（LiteLLM SDK 支持的所有主流 provider）
# ------------------------------------------------------------------

PROVIDERS: dict[str, dict] = {
    # ==================== 主流 API Provider ====================
    "openai": {
        "name": "OpenAI",
        "prefix": "openai",
        "env_key": "OPENAI_API_KEY",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3-mini"],
        "default": "gpt-4o-mini",
        "context_tokens": 128_000,
        "description": "OpenAI GPT 系列，全球最流行的商用 LLM",
    },
    "anthropic": {
        "name": "Anthropic",
        "prefix": "anthropic",
        "env_key": "ANTHROPIC_API_KEY",
        "models": ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
        "default": "claude-sonnet-4-20250514",
        "context_tokens": 200_000,
        "description": "Anthropic Claude 系列，擅长长文本理解",
    },
    "deepseek": {
        "name": "DeepSeek",
        "prefix": "deepseek",
        "env_key": "DEEPSEEK_API_KEY",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "default": "deepseek-chat",
        "context_tokens": 128_000,
        "description": "DeepSeek V3 聊天/推理模型，高性价比",
    },
    "gemini": {
        "name": "Google Gemini",
        "prefix": "gemini",
        "env_key": "GEMINI_API_KEY",
        "models": [
            "gemini-3.1-pro-preview",
            "gemini-3.1-flash-lite-preview",
            "gemini-3-pro-preview",
            "gemini-3-flash",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash",
        ],
        "default": "gemini-2.5-flash",
        "context_tokens": 1_000_000,
        "description": "Google Gemini 系列（AI Studio API Key 模式），超长上下文窗口",
    },
    "xai": {
        "name": "xAI (Grok)",
        "prefix": "xai",
        "env_key": "XAI_API_KEY",
        "models": ["grok-3", "grok-3-mini", "grok-2-latest"],
        "default": "grok-3-mini",
        "context_tokens": 131_072,
        "description": "xAI Grok 系列，实时信息和长上下文",
    },
    "mistral": {
        "name": "Mistral AI",
        "prefix": "mistral",
        "env_key": "MISTRAL_API_KEY",
        "models": ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
        "default": "mistral-small-latest",
        "context_tokens": 128_000,
        "description": "Mistral AI 欧洲旗舰模型",
    },
    "minimax": {
        "name": "MiniMax",
        "prefix": "minimax",
        "env_key": "MINIMAX_API_KEY",
        "models": ["MiniMax-M2.1"],
        "default": "MiniMax-M2.1",
        "context_tokens": 1_000_000,
        "description": "MiniMax 海螺 AI，国产大模型，支持超长上下文",
        "needs_api_base": True,
        "default_api_base": "https://api.minimax.io/v1",
    },
    "zai": {
        "name": "智谱 GLM",
        "prefix": "zai",
        "env_key": "ZAI_API_KEY",
        "models": ["glm-4.7", "glm-4.5-flash", "glm-4.5", "glm-4.5-air"],
        "default": "glm-4.5-flash",
        "context_tokens": 200_000,
        "description": "智谱 AI GLM 系列，glm-4.5-flash 免费可用",
    },
    "moonshot": {
        "name": "Moonshot (Kimi)",
        "prefix": "moonshot",
        "env_key": "MOONSHOT_API_KEY",
        "models": ["kimi-k2-0711-preview", "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
        "default": "moonshot-v1-32k",
        "context_tokens": 128_000,
        "description": "月之暗面 Kimi，超长上下文对话",
    },
    "dashscope": {
        "name": "通义千问 (Qwen)",
        "prefix": "dashscope",
        "env_key": "DASHSCOPE_API_KEY",
        "models": ["qwen-max", "qwen-plus", "qwen-turbo", "qwen3-235b-a22b"],
        "default": "qwen-plus",
        "context_tokens": 131_072,
        "description": "阿里云通义千问 Qwen 系列",
    },
    "cohere": {
        "name": "Cohere",
        "prefix": "cohere",
        "env_key": "COHERE_API_KEY",
        "models": ["command-r-plus", "command-r", "command-light"],
        "default": "command-r",
        "context_tokens": 128_000,
        "description": "Cohere Command 系列，企业级 RAG 和搜索",
    },
    "perplexity": {
        "name": "Perplexity",
        "prefix": "perplexity",
        "env_key": "PERPLEXITYAI_API_KEY",
        "models": ["sonar-pro", "sonar", "sonar-reasoning-pro"],
        "default": "sonar",
        "context_tokens": 128_000,
        "description": "Perplexity Sonar 系列，内置网络搜索增强",
    },
    # ==================== 推理加速 Provider ====================
    "groq": {
        "name": "Groq",
        "prefix": "groq",
        "env_key": "GROQ_API_KEY",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"],
        "default": "llama-3.3-70b-versatile",
        "context_tokens": 128_000,
        "description": "Groq LPU 推理，超快速度运行开源模型",
    },
    "fireworks_ai": {
        "name": "Fireworks AI",
        "prefix": "fireworks_ai",
        "env_key": "FIREWORKS_AI_API_KEY",
        "models": ["accounts/fireworks/models/llama-v3p1-70b-instruct", "accounts/fireworks/models/mixtral-8x7b-instruct"],
        "default": "accounts/fireworks/models/llama-v3p1-70b-instruct",
        "context_tokens": 131_072,
        "description": "Fireworks AI 高速推理平台",
    },
    "together_ai": {
        "name": "Together AI",
        "prefix": "together_ai",
        "env_key": "TOGETHERAI_API_KEY",
        "models": ["meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-R1"],
        "default": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        "context_tokens": 131_072,
        "description": "Together AI 开源模型托管，支持微调",
    },
    # ==================== 聚合 / 本地 ====================
    "openrouter": {
        "name": "OpenRouter",
        "prefix": "openrouter",
        "env_key": "OPENROUTER_API_KEY",
        "models": [],
        "default": "",
        "context_tokens": 128_000,
        "description": "OpenRouter 聚合平台，可访问 100+ 模型",
        "custom_model": True,
    },
    "ollama": {
        "name": "Ollama (本地)",
        "prefix": "ollama",
        "env_key": "",
        "models": ["llama3.1", "qwen2.5", "deepseek-r1", "gemma2"],
        "default": "llama3.1",
        "context_tokens": 128_000,
        "description": "本地 Ollama 运行的开源模型，无需 API Key",
        "needs_api_base": True,
        "default_api_base": "http://localhost:11434",
    },
    "huggingface": {
        "name": "HuggingFace",
        "prefix": "huggingface",
        "env_key": "HUGGINGFACE_API_KEY",
        "models": [],
        "default": "",
        "context_tokens": 32_000,
        "description": "HuggingFace Inference Endpoints，需要 api_base",
        "custom_model": True,
        "needs_api_base": True,
    },
    # ==================== 云厂商 Provider ====================
    "azure": {
        "name": "Azure OpenAI",
        "prefix": "azure",
        "env_key": "AZURE_API_KEY",
        "models": [],
        "default": "",
        "context_tokens": 128_000,
        "description": "Azure OpenAI 部署，需要 api_base 和部署名",
        "custom_model": True,
        "needs_api_base": True,
    },
    "bedrock": {
        "name": "AWS Bedrock",
        "prefix": "bedrock",
        "env_key": "AWS_ACCESS_KEY_ID",
        "models": ["anthropic.claude-3-5-sonnet-20241022-v2:0", "meta.llama3-1-70b-instruct-v1:0", "amazon.nova-pro-v1:0"],
        "default": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "context_tokens": 200_000,
        "description": "AWS Bedrock 托管模型，需要 AWS 凭证",
        "needs_extra_config": True,
    },
    "vertex_ai": {
        "name": "Google Vertex AI",
        "prefix": "vertex_ai",
        "env_key": "",
        "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
        "default": "gemini-2.5-flash",
        "context_tokens": 1_000_000,
        "description": "Google Vertex AI（GCP 凭证模式），企业级部署",
        "needs_extra_config": True,
    },
}

# 不支持 presence/frequency penalty 的 provider 前缀
_NO_PENALTY_PREFIXES = (
    "gemini/", "anthropic/", "ollama/", "cohere/",
    "bedrock/", "vertex_ai/", "perplexity/",
)


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

    @router.get("/api/providers")
    async def get_providers():
        """返回所有支持的 Provider 及其模型列表（供前端动态渲染）。"""
        return {"providers": PROVIDERS}

    @router.get("/api/config")
    async def get_api_config():
        return {
            "current_config": orchestrator.get_current_config(),
            "providers": PROVIDERS,
        }

    @router.post("/api/config")
    async def update_api_config(config: APIConfigRequest):
        provider_def = PROVIDERS.get(config.provider)
        if provider_def is None:
            available = ", ".join(PROVIDERS.keys())
            raise HTTPException(
                status_code=400,
                detail=f"不支持的 Provider: {config.provider}。支持: {available}",
            )

        prefix = provider_def["prefix"]
        ctx = provider_def["context_tokens"]
        api_base = config.api_base or provider_def.get("default_api_base")

        # 确定要注册的 model 列表
        model_list = provider_def["models"]
        if config.model and config.model not in model_list:
            model_list = [config.model] + model_list

        from core.llm import ModelCapabilities
        from core.llm.providers.litellm_provider import LiteLLMProvider, ModelConfig

        models: dict[str, ModelConfig] = {}
        for mid in model_list:
            models[mid] = ModelConfig(
                litellm_model=f"{prefix}/{mid}",
                api_key=config.api_key,
                capabilities=ModelCapabilities(max_context_tokens=ctx),
                api_base=api_base,
            )

        if models:
            orchestrator.registry.register(LiteLLMProvider(models=models))

        # 选定的 model
        active_model = config.model or provider_def["default"]
        if active_model:
            orchestrator.update_model(active_model)

        # 测试连接
        test_result = await orchestrator.test_connection()

        return {
            "message": "API配置更新成功",
            "provider": config.provider,
            "model": active_model,
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
    # 生成设置
    # ==================================================================

    @router.get("/api/settings")
    async def get_settings():
        return {
            "response_length": orchestrator.response_length,
        }

    @router.post("/api/settings")
    async def update_settings(req: SettingsRequest):
        try:
            orchestrator.update_response_length(req.response_length)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {
            "message": "设置已更新",
            "response_length": orchestrator.response_length,
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

    # ==============================================================
    # Persona 人设管理
    # ==============================================================

    @router.get("/api/personas")
    async def list_personas():
        personas = await repo.load_all_personas()
        return [{"id": p.id, "name": p.name, "description": p.description,
                 "is_default": p.is_default} for p in personas]

    @router.post("/api/personas")
    async def create_persona(data: PersonaRequest):
        persona = Persona(name=data.name, description=data.description,
                          is_default=data.is_default)
        await repo.save_persona(persona)
        return {"status": "success", "persona": persona.model_dump()}

    @router.put("/api/personas/{persona_id}")
    async def update_persona(persona_id: str, data: PersonaRequest):
        persona = Persona(id=persona_id, name=data.name,
                          description=data.description, is_default=data.is_default)
        await repo.save_persona(persona)
        return {"status": "success", "persona": persona.model_dump()}

    @router.delete("/api/personas/{persona_id}")
    async def delete_persona(persona_id: str):
        await repo.delete_persona(persona_id)
        return {"status": "success"}

    # ==============================================================
    # World Info 世界观管理
    # ==============================================================

    @router.get("/api/world-info")
    async def list_world_info_books():
        books = await repo.load_all_world_info_books()
        return [b.model_dump() for b in books]

    @router.post("/api/world-info")
    async def create_world_info_book(data: WorldInfoBookRequest):
        book = WorldInfoBook(name=data.name, description=data.description,
                             enabled=data.enabled)
        await repo.save_world_info_book(book)
        return {"status": "success", "book": book.model_dump()}

    @router.put("/api/world-info/{book_id}")
    async def update_world_info_book(book_id: str, data: WorldInfoBookRequest):
        book = WorldInfoBook(id=book_id, name=data.name,
                             description=data.description, enabled=data.enabled)
        await repo.save_world_info_book(book)
        return {"status": "success", "book": book.model_dump()}

    @router.delete("/api/world-info/{book_id}")
    async def delete_world_info_book(book_id: str):
        await repo.delete_world_info_book(book_id)
        return {"status": "success"}

    # --- World Info Entries ---

    @router.get("/api/world-info/{book_id}/entries")
    async def list_world_info_entries(book_id: str):
        books = await repo.load_all_world_info_books()
        target = next((b for b in books if b.id == book_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="知识库不存在")
        return [e.model_dump() for e in target.entries]

    @router.post("/api/world-info/{book_id}/entries")
    async def create_world_info_entry(book_id: str, data: WorldInfoEntryRequest):
        entry = WorldInfoEntry(
            keys=data.keys, content=data.content,
            secondary_keys=data.secondary_keys,
            selective_logic=data.selective_logic,
            position=WIPosition(data.position),
            depth=data.depth, enabled=data.enabled,
            constant=data.constant, order=data.order,
        )
        await repo.save_world_info_entry(entry, book_id)
        return {"status": "success", "entry": entry.model_dump()}

    @router.put("/api/world-info/{book_id}/entries/{entry_id}")
    async def update_world_info_entry(
        book_id: str, entry_id: str, data: WorldInfoEntryRequest
    ):
        entry = WorldInfoEntry(
            id=entry_id, keys=data.keys, content=data.content,
            secondary_keys=data.secondary_keys,
            selective_logic=data.selective_logic,
            position=WIPosition(data.position),
            depth=data.depth, enabled=data.enabled,
            constant=data.constant, order=data.order,
        )
        await repo.save_world_info_entry(entry, book_id)
        return {"status": "success", "entry": entry.model_dump()}

    @router.delete("/api/world-info/{book_id}/entries/{entry_id}")
    async def delete_world_info_entry(book_id: str, entry_id: str):
        await repo.delete_world_info_entry(entry_id)
        return {"status": "success"}

    # ==============================================================
    # Room ↔ WorldInfo 绑定
    # ==============================================================

    @router.get("/api/rooms/{room_id}/world-info")
    async def get_room_world_info(room_id: str):
        books = await repo.load_room_worldinfo_books(room_id)
        return [b.model_dump() for b in books]

    @router.put("/api/rooms/{room_id}/world-info")
    async def update_room_world_info(room_id: str, data: RoomWorldInfoRequest):
        # 先解绑所有
        current = await repo.load_room_worldinfo_books(room_id)
        for b in current:
            await repo.unbind_room_worldinfo(room_id, b.id)
        # 再绑定指定的
        for bid in data.book_ids:
            await repo.bind_room_worldinfo(room_id, bid)
        return {"status": "success"}

    return router
