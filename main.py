"""
AI Tea Party — 重构入口 (v2.1.0)

使用三层架构：Provider → Orchestrator → Transport
原 main.py (670 行) 精简为 ~120 行。
"""

import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.llm import ModelCapabilities, ProviderRegistry
from core.llm.providers.litellm_provider import LiteLLMProvider, ModelConfig
from db import repository as db_repo
from db.database import init_db
from models.character import ChatRoom
from routes.rest import setup_rest_routes
from routes.sse import setup_sse_routes
from routes.ws import WebSocketManager, setup_ws_routes
from services.chat_service import chat_service
from services.orchestrator import ChatOrchestrator
from utils.config_loader import config_loader
from utils.env_watcher import env_watcher

# ------------------------------------------------------------------
# 环境与日志
# ------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Lifespan（DB 初始化 + 数据恢复）
# ------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动时初始化 DB 并从中恢复数据"""
    await init_db()

    # 恢复设置
    saved_length = await db_repo.get_setting("response_length", "default")
    if saved_length in ("short", "default", "long"):
        orchestrator.response_length = saved_length
        logger.info(f"从 DB 恢复 response_length: {saved_length}")

    # 尝试从 DB 恢复聊天室
    db_rooms = await db_repo.load_all_rooms()
    if db_rooms:
        logger.info(f"从 SQLite 恢复 {len(db_rooms)} 个聊天室")
        for rd in db_rooms:
            room = ChatRoom(
                id=rd["id"],
                name=rd["name"],
                description=rd["description"],
                stealth_mode=rd["stealth_mode"],
                user_description=rd["user_description"],
                characters=rd["characters"],
                messages=rd["messages"],
            )
            chat_service.chat_rooms[room.id] = room
            logger.info(f"  恢复聊天室: {room.name} ({len(rd['characters'])} 角色, {len(rd['messages'])} 消息)")
    else:
        # DB 为空，从 config.json 初始化（chat_service 会自动持久化 rooms）
        logger.info("SQLite 为空，从 config.json 初始化...")
        await _init_from_config()

    yield


async def _init_from_config():
    """从 config.json 加载预设聊天室和角色"""
    if config_loader.load_config():
        rooms = config_loader.initialize_rooms()
        if rooms:
            logger.info(f"成功加载 {len(rooms)} 个预设聊天室")
        if "default" not in chat_service.chat_rooms:
            logger.warning("config.json 中没有 default 房间，创建默认房间")
            default_room = chat_service.create_chat_room("AI Tea Party 聊天室")
            default_room.id = "default"
            chat_service.chat_rooms["default"] = default_room
    else:
        logger.info("未找到 config.json，创建默认聊天室")
        default_room = chat_service.create_chat_room("AI Tea Party 聊天室")
        default_room.id = "default"
        chat_service.chat_rooms["default"] = default_room

    # config_loader 直接调用 room.add_character()，绕过了 chat_service 的 DB 写入
    # 需要在这里手动持久化所有角色
    for room_id, room in chat_service.chat_rooms.items():
        await db_repo.save_room(room)  # 确保 room（含自定义 ID）被保存
        for character in room.characters:
            await db_repo.save_character(character, room_id)


# ------------------------------------------------------------------
# FastAPI 应用
# ------------------------------------------------------------------

app = FastAPI(title="AI Tea Party", description="AI角色聊天室", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Provider 注册
# ------------------------------------------------------------------

registry = ProviderRegistry()


def register_providers() -> None:
    """从环境变量自动注册所有可用的 Provider（基于 PROVIDERS 注册表）。"""
    from routes.rest import PROVIDERS

    models: dict[str, ModelConfig] = {}

    for provider_key, pdef in PROVIDERS.items():
        env_key = pdef.get("env_key", "")
        api_key = os.getenv(env_key, "") if env_key else ""
        needs_key = bool(env_key)

        # 跳过需要 API Key 但未配置的 provider
        if needs_key and not api_key:
            continue

        prefix = pdef["prefix"]
        ctx = pdef["context_tokens"]
        api_base = pdef.get("default_api_base")

        for mid in pdef["models"]:
            models[mid] = ModelConfig(
                litellm_model=f"{prefix}/{mid}",
                api_key=api_key,
                capabilities=ModelCapabilities(
                    max_context_tokens=ctx, max_output_tokens=8_192
                ),
                api_base=api_base,
            )
        if models:
            logger.info(f"  ✓ {pdef['name']} ({len(pdef['models'])} models)")

    if models:
        registry.register(LiteLLMProvider(models=models))


register_providers()

# ------------------------------------------------------------------
# 确定默认模型
# ------------------------------------------------------------------

_default_model = os.getenv("AI_DEFAULT_MODEL", "")
if not _default_model:
    # 按优先级自动选择：DeepSeek → Gemini → OpenAI → 第一个可用
    for key, env in [("deepseek-chat", "DEEPSEEK_API_KEY"), ("gemini-2.5-flash", "GEMINI_API_KEY"), ("gpt-4o-mini", "OPENAI_API_KEY")]:
        if os.getenv(env):
            _default_model = key
            break
    if not _default_model:
        _default_model = "deepseek-chat"  # fallback

# ------------------------------------------------------------------
# Orchestrator
# ------------------------------------------------------------------

orchestrator = ChatOrchestrator(
    registry=registry,
    current_model_id=_default_model,
)

# 注入 Orchestrator 到 ChatService（用于自动聊天等路径）
chat_service.set_orchestrator(orchestrator)

# ------------------------------------------------------------------
# WebSocket Manager
# ------------------------------------------------------------------

ws_manager = WebSocketManager()

# WS 消息回调：Orchestrator 生成完成后通过此回调广播
async def _ws_message_callback(room_id, message):
    await ws_manager.broadcast_message(room_id, message)

orchestrator.add_message_callback(_ws_message_callback)
chat_service.add_message_callback(_ws_message_callback)


DEFAULT_ROOM_ID = "default"

# 初始化逻辑已移至 lifespan() 中：启动时先从 SQLite 恢复，如果为空则从 config.json 初始化

# ------------------------------------------------------------------
# 注册路由
# ------------------------------------------------------------------

app.include_router(setup_rest_routes(orchestrator, chat_service, ws_manager, DEFAULT_ROOM_ID))
app.include_router(setup_sse_routes(orchestrator, chat_service))
app.include_router(setup_ws_routes(ws_manager))


@app.get("/")
async def home():
    return {"message": "AI Tea Party API", "version": "2.1.0", "docs": "/docs"}


# ------------------------------------------------------------------
# 入口
# ------------------------------------------------------------------

if __name__ == "__main__":
    if not orchestrator.is_configured():
        logger.warning("AI服务未配置，请在 .env 中设置 DEEPSEEK_API_KEY 或 GEMINI_API_KEY")

    # .env 热重载
    def on_env_reload():
        logger.info("🔄 检测到 .env 变化，正在重新加载...")
        load_dotenv(override=True)
        register_providers()
        logger.info(f"✅ Provider 已重载: {registry.registered_providers}")

    env_watcher.add_callback(on_env_reload)
    env_watcher.start()

    host = os.getenv("HOST", "localhost")
    port = int(os.getenv("PORT", "3004"))

    logger.info(f"🚀 启动 AI Tea Party v2.1.0: http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
