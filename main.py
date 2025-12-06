import os
import logging
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import uvicorn
from dotenv import load_dotenv
from services.ai_service import APIProvider

# 导入自定义模块
from models.character import Character, Message, ChatRoom
from services.chat_service import chat_service
from services.ai_service import ai_service
from utils.config_loader import config_loader
from utils.env_watcher import env_watcher

# WebSocket管理器
class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        logger.info(f"WebSocket连接已建立，房间: {room_id}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        logger.info(f"WebSocket连接已断开，房间: {room_id}")

    async def broadcast_message(self, room_id: str, message: Message):
        if room_id in self.active_connections:
            message_data = {
                "type": "message",
                "data": {
                    "id": message.id,
                    "content": message.content,
                    "character_id": message.character_id,
                    "character_name": message.character_name,
                    "timestamp": message.timestamp.isoformat(),
                    "is_system": message.is_system
                }
            }
            await self._broadcast_to_room(room_id, message_data)

    async def broadcast_character_update(self, room_id: str, action: str, character_data: dict):
        if room_id in self.active_connections:
            update_data = {
                "type": "character_update",
                "data": {
                    "action": action,
                    "character": character_data
                }
            }
            await self._broadcast_to_room(room_id, update_data)

    async def broadcast_room_status(self, room_id: str, status_data: dict):
        if room_id in self.active_connections:
            status_update = {
                "type": "room_status",
                "data": status_data
            }
            await self._broadcast_to_room(room_id, status_update)

    async def _broadcast_to_room(self, room_id: str, data: dict):
        if room_id not in self.active_connections:
            return

        disconnected = []
        for websocket in self.active_connections[room_id]:
            try:
                await websocket.send_json(data)
            except Exception as e:
                logger.warning(f"发送WebSocket消息失败: {e}")
                disconnected.append(websocket)

        # 清理断开的连接
        for websocket in disconnected:
            self.disconnect(websocket, room_id)

    def get_room_connection_count(self, room_id: str) -> int:
        return len(self.active_connections.get(room_id, []))

websocket_manager = WebSocketManager()

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建FastAPI应用
app = FastAPI(title="AI Tea Party", description="AI角色聊天室")

# 配置CORS以支持Next.js前端
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://localhost:3001",  # Next.js dev server (alternate port)
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:8000",  # Original frontend
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件和模板
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# 请求模型
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

class GenerateRequest(BaseModel):
    character_id: str

# 初始化聊天室
# 尝试从 config.json 加载预设配置
if config_loader.load_config():
    logger.info("正在从 config.json 加载预设聊天室和角色...")
    rooms = config_loader.initialize_rooms()
    if rooms:
        logger.info(f"成功加载 {len(rooms)} 个预设聊天室")
        # 确保 default 房间存在
        if "default" not in chat_service.chat_rooms:
            logger.warning("config.json 中没有 default 房间，创建默认房间")
            default_room = chat_service.create_chat_room("AI Tea Party 聊天室")
            default_room.id = "default"
            chat_service.chat_rooms["default"] = default_room
    else:
        logger.warning("未能从 config.json 加载聊天室，创建默认房间")
        default_room = chat_service.create_chat_room("AI Tea Party 聊天室")
        default_room.id = "default"
        chat_service.chat_rooms["default"] = default_room
else:
    logger.info("未找到 config.json，创建默认聊天室")
    default_room = chat_service.create_chat_room("AI Tea Party 聊天室")
    default_room.id = "default"
    chat_service.chat_rooms["default"] = default_room

DEFAULT_ROOM_ID = "default"

# WebSocket消息回调
async def websocket_message_callback(room_id: str, message: Message):
    """WebSocket消息回调函数"""
    await websocket_manager.broadcast_message(room_id, message)

# 注册回调
chat_service.add_message_callback(websocket_message_callback)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """主页"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket连接端点"""
    await websocket_manager.connect(websocket, room_id)
    try:
        while True:
            # 保持连接活跃
            data = await websocket.receive_text()
            # 可以在这里处理客户端发送的消息
            logger.info(f"收到WebSocket消息: {data}")
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket, room_id)

# API路由
@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    """获取聊天室信息"""
    room = chat_service.get_chat_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="聊天室不存在")
    
    return {
        "id": room.id,
        "name": room.name,
        "is_auto_chat": room.is_auto_chat,
        "character_count": len(room.characters),
        "message_count": len(room.messages)
    }

@app.get("/api/rooms/{room_id}/characters")
async def get_characters(room_id: str):
    """获取聊天室角色列表"""
    room = chat_service.get_chat_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="聊天室不存在")
    
    return [
        {
            "id": char.id,
            "name": char.name,
            "personality": char.personality,
            "background": char.background,
            "speaking_style": char.speaking_style,
            "is_active": char.is_active
        }
        for char in room.characters
    ]

@app.post("/api/characters")
async def create_character_globally(character_data: CharacterRequest):
    """
    创建一个全局角色，并将其添加到默认聊天室。
    这主要用于简化测试和初始设置。
    """
    if not ai_service.is_configured():
        raise HTTPException(status_code=400, detail="AI服务未配置，请在设置中配置API密钥")

    character = Character(
        name=character_data.name,
        personality=character_data.personality,
        background=character_data.background,
        speaking_style=character_data.speaking_style or ""
    )
    
    # 直接使用 chat_service 中的方法，它应该能处理角色和房间的关联
    # 假设 chat_service 有一个方法可以创建并添加角色
    # 为了简化，我们直接添加到默认房间
    success = chat_service.add_character_to_room(DEFAULT_ROOM_ID, character)
    if not success:
        # 这个错误可能意味着默认房间没有找到，这是一个内部问题
        raise HTTPException(status_code=500, detail="无法将角色添加到默认聊天室")

    await websocket_manager.broadcast_character_update(
        DEFAULT_ROOM_ID, 
        "added", 
        character.model_dump()
    )
    
    return character


@app.post("/api/rooms/{room_id}/characters")
async def add_character(room_id: str, character_data: CharacterRequest):
    """添加角色到聊天室"""
    if not ai_service.is_configured():
        raise HTTPException(status_code=400, detail="AI服务未配置，请在设置中配置API密钥（支持DeepSeek或Gemini）")
    
    character = Character(
        name=character_data.name,
        personality=character_data.personality,
        background=character_data.background,
        speaking_style=character_data.speaking_style or ""
    )
    
    success = chat_service.add_character_to_room(room_id, character)
    if not success:
        raise HTTPException(status_code=404, detail="聊天室不存在")
    
    # 通知WebSocket客户端
    await websocket_manager.broadcast_character_update(
        room_id, 
        "added", 
        {
            "id": character.id,
            "name": character.name,
            "personality": character.personality,
            "background": character.background,
            "speaking_style": character.speaking_style,
            "is_active": character.is_active
        }
    )
    
    return {"message": "角色添加成功", "character_id": character.id}

@app.delete("/api/rooms/{room_id}/characters/{character_id}")
async def remove_character(room_id: str, character_id: str):
    """从聊天室移除角色"""
    success = chat_service.remove_character_from_room(room_id, character_id)
    if not success:
        raise HTTPException(status_code=404, detail="聊天室或角色不存在")
    
    # 通知WebSocket客户端
    await websocket_manager.broadcast_character_update(
        room_id, 
        "removed", 
        {"id": character_id}
    )
    
    return {"message": "角色移除成功"}

@app.get("/api/rooms/{room_id}/messages")
async def get_messages(room_id: str, limit: int = 50):
    """获取聊天消息"""
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
            "is_system": msg.is_system
        }
        for msg in messages
    ]

@app.post("/api/rooms/{room_id}/messages")
async def send_message(room_id: str, message_data: MessageRequest):
    """发送消息"""
    success = await chat_service.send_message(
        room_id, 
        message_data.character_id, 
        message_data.content
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="聊天室或角色不存在")
    
    return {"message": "消息发送成功"}

@app.delete("/api/rooms/{room_id}/messages")
async def clear_messages(room_id: str):
    """清空聊天消息"""
    room = chat_service.get_chat_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="聊天室不存在")
    
    room.messages.clear()
    
    # 发送系统消息
    system_msg = Message(
        character_id="system",
        character_name="系统",
        content="聊天记录已清空",
        is_system=True
    )
    room.add_message(system_msg)
    await websocket_message_callback(room_id, system_msg)
    
    return {"message": "聊天记录已清空"}

@app.post("/api/rooms/{room_id}/generate")
async def generate_response(room_id: str, generate_data: GenerateRequest):
    """生成AI回复"""
    if not ai_service.is_configured():
        raise HTTPException(status_code=400, detail="AI服务未配置，请在设置中配置API密钥（支持DeepSeek或Gemini）")
    
    response = await chat_service.generate_ai_response(room_id, generate_data.character_id)
    if response is None:
        raise HTTPException(status_code=404, detail="生成回复失败")
    
    return {"message": "回复生成成功", "content": response}


@app.post("/api/rooms/{room_id}/generate/stream")
async def stream_generate_response(room_id: str, generate_data: GenerateRequest):
    """流式生成AI回复"""
    if not ai_service.is_configured():
        raise HTTPException(status_code=400, detail="AI服务未配置，请在设置中配置API密钥（支持DeepSeek或Gemini）")

    room = chat_service.get_chat_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="聊天室不存在")

    character = next((c for c in room.characters if c.id == generate_data.character_id), None)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")

    async def event_generator():
        async for event in chat_service.stream_ai_response(room_id, generate_data.character_id):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/rooms/{room_id}/auto-chat/start")
async def start_auto_chat(room_id: str):
    """开始自动聊天"""
    if not ai_service.is_configured():
        raise HTTPException(status_code=400, detail="AI服务未配置，请在设置中配置API密钥（支持DeepSeek或Gemini）")
    
    interval = int(os.getenv("AUTO_CHAT_INTERVAL", 5))
    chat_service.start_auto_chat(room_id, interval)
    
    # 通知WebSocket客户端
    await websocket_manager.broadcast_room_status(room_id, {"is_auto_chat": True})
    
    return {"message": "自动聊天已开始"}

@app.post("/api/rooms/{room_id}/auto-chat/stop")
async def stop_auto_chat(room_id: str):
    """停止自动聊天"""
    chat_service.stop_auto_chat(room_id)
    
    # 通知WebSocket客户端
    await websocket_manager.broadcast_room_status(room_id, {"is_auto_chat": False})
    
    return {"message": "自动聊天已停止"}

@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "ai_configured": ai_service.is_configured(),
        "rooms": len(chat_service.chat_rooms),
        "connections": sum(
            websocket_manager.get_room_connection_count(room_id)
            for room_id in websocket_manager.active_connections.keys()
        )
    }

@app.get("/api/config")
async def get_api_config():
    """获取当前API配置"""
    return {
        "current_config": ai_service.get_current_config(),
        "available_providers": ai_service.get_available_providers()
    }

@app.post("/api/config")
async def update_api_config(config: APIConfigRequest):
    """更新API配置"""
    try:
        # 验证提供商 - 仅支持四个模型
        provider_map = {
            "deepseek_chat": APIProvider.DEEPSEEK_CHAT,
            "deepseek_reasoner": APIProvider.DEEPSEEK_REASONER,
            "gemini_25_flash": APIProvider.GEMINI_25_FLASH,
            "gemini_25_pro": APIProvider.GEMINI_25_PRO
        }

        if config.provider not in provider_map:
            available_providers = ", ".join(provider_map.keys())
            raise HTTPException(status_code=400, detail=f"不支持的API提供商: {config.provider}。支持的提供商: {available_providers}")

        provider = provider_map[config.provider]

        # 更新配置
        ai_service.update_config(provider, config.api_key, config.model)

        # 立即测试API连接
        test_result = await ai_service.test_api_connection()

        return {
            "message": "API配置更新成功",
            "config": ai_service.get_current_config(),
            "test_result": test_result
        }

    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"更新API配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")

@app.post("/api/test-connection")
async def test_api_connection():
    """测试API连接"""
    try:
        result = await ai_service.test_api_connection()
        return result
    except Exception as e:
        logger.error(f"API连接测试失败: {e}")
        raise HTTPException(status_code=500, detail=f"连接测试失败: {str(e)}")

@app.get("/api/status")
async def get_api_status():
    """获取API状态"""
    try:
        return ai_service.get_api_status()
    except Exception as e:
        logger.error(f"获取API状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取状态失败: {str(e)}")

@app.post("/api/rooms")
async def create_room(request: CreateRoomRequest):
    """创建新聊天室"""
    try:
        room = chat_service.create_chat_room(
            name=request.name,
            description=request.description,
            stealth_mode=request.stealth_mode,
            user_description=request.user_description
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
                "created_at": room.created_at.isoformat()
            }
        }
    except Exception as e:
        logger.error(f"创建聊天室失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rooms")
async def get_rooms():
    """获取所有聊天室"""
    try:
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
                            "is_active": c.is_active
                        } for c in room.characters
                    ]
                } for room in rooms
            ]
        }
    except Exception as e:
        logger.error(f"获取聊天室列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/rooms/{room_id}")
async def update_room(room_id: str, request: UpdateRoomRequest):
    """更新聊天室设置"""
    try:
        success = chat_service.update_room_settings(
            room_id=room_id,
            stealth_mode=request.stealth_mode,
            user_description=request.user_description,
            name=request.name,
            description=request.description
        )

        if not success:
            raise HTTPException(status_code=404, detail="聊天室不存在")

        return {"status": "success", "message": "聊天室设置已更新"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新聊天室设置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # 检查AI服务配置
    if not ai_service.is_configured():
        logger.warning("AI服务未配置，请在.env文件中设置DEEPSEEK_API_KEY或GEMINI_API_KEY")

    # 设置 .env 热重载回调
    def on_env_reload():
        """当 .env 文件更新时重新加载 AI 配置"""
        logger.info("🔄 检测到 .env 变化，正在重新加载 AI 配置...")
        ai_service._load_default_config()
        if ai_service.is_configured():
            logger.info(f"✅ AI 配置已更新: {ai_service.get_current_config()}")
        else:
            logger.warning("⚠️  AI 服务未配置")

    # 启动 .env 热重载
    env_watcher.add_callback(on_env_reload)
    env_watcher.start()

    # 启动服务器
    host = os.getenv("HOST", "localhost")
    port = int(os.getenv("PORT", 3004))

    logger.info(f"启动AI Tea Party服务器: http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
