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
    """从环境变量注册所有可用的 Provider（统一使用 LiteLLM）。"""
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    models: dict[str, ModelConfig] = {}

    if deepseek_key:
        models["deepseek-chat"] = ModelConfig(
            litellm_model="deepseek/deepseek-chat",
            api_key=deepseek_key,
            capabilities=ModelCapabilities(
                max_context_tokens=128_000, max_output_tokens=8_192
            ),
        )
        models["deepseek-reasoner"] = ModelConfig(
            litellm_model="deepseek/deepseek-reasoner",
            api_key=deepseek_key,
            capabilities=ModelCapabilities(
                max_context_tokens=128_000, max_output_tokens=8_192
            ),
        )

    if gemini_key:
        gemini_models = {
            "gemini-2.5-flash": "gemini/gemini-2.5-flash",
            "gemini-2.5-pro": "gemini/gemini-2.5-pro",
            "gemini-3-flash-preview": "gemini/gemini-3-flash-preview",
            "gemini-3.1-pro-preview": "gemini/gemini-3.1-pro-preview",
            "gemini-3.1-flash-lite-preview": "gemini/gemini-3.1-flash-lite-preview",
        }
        for model_id, litellm_name in gemini_models.items():
            models[model_id] = ModelConfig(
                litellm_model=litellm_name,
                api_key=gemini_key,
                capabilities=ModelCapabilities(
                    max_context_tokens=1_000_000, max_output_tokens=8_192
                ),
            )

    if models:
        registry.register(LiteLLMProvider(models=models))


register_providers()

# ------------------------------------------------------------------
# 确定默认模型
# ------------------------------------------------------------------

_provider_str = os.getenv("AI_PROVIDER", "deepseek_chat").lower()
_PROVIDER_TO_MODEL = {
    "deepseek_chat": "deepseek-chat",
    "deepseek_reasoner": "deepseek-reasoner",
    "gemini_25_flash": "gemini-2.5-flash",
    "gemini_25_pro": "gemini-2.5-pro",
    "gemini_3_flash": "gemini-3-flash-preview",
    "gemini_31_pro": "gemini-3.1-pro-preview",
    "gemini_31_flash_lite": "gemini-3.1-flash-lite-preview",
}
_default_model = _PROVIDER_TO_MODEL.get(_provider_str, "deepseek-chat")

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
