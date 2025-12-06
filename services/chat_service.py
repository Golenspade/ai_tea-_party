import asyncio
import random
import logging
from typing import List, Optional, Callable, AsyncGenerator, Dict
from datetime import datetime
from models.character import Character, Message, ChatRoom
from services.ai_service import ai_service

logger = logging.getLogger(__name__)


class ChatService:
    """聊天服务类，管理聊天室逻辑"""
    
    def __init__(self):
        self.chat_rooms: dict[str, ChatRoom] = {}
        self.message_callbacks: List[Callable] = []
        self.auto_chat_tasks: dict[str, asyncio.Task] = {}
        
    def add_message_callback(self, callback: Callable):
        """添加消息回调函数"""
        self.message_callbacks.append(callback)
        
    async def notify_message_callbacks(self, room_id: str, message: Message):
        """通知所有消息回调"""
        for callback in self.message_callbacks:
            try:
                await callback(room_id, message)
            except Exception as e:
                logger.error(f"消息回调执行失败: {e}")
    
    def create_chat_room(
        self,
        name: str,
        description: str = "",
        stealth_mode: bool = False,
        user_description: str = ""
    ) -> ChatRoom:
        """创建聊天室"""
        room = ChatRoom(
            name=name,
            description=description,
            stealth_mode=stealth_mode,
            user_description=user_description
        )
        self.chat_rooms[room.id] = room
        logger.info(f"创建聊天室: {name} (ID: {room.id})")
        return room
    
    def get_chat_room(self, room_id: str) -> Optional[ChatRoom]:
        """获取聊天室"""
        return self.chat_rooms.get(room_id)
    
    def get_all_chat_rooms(self) -> List[ChatRoom]:
        """获取所有聊天室"""
        return list(self.chat_rooms.values())
    
    def add_character_to_room(self, room_id: str, character: Character) -> bool:
        """添加角色到聊天室"""
        room = self.get_chat_room(room_id)
        if room:
            room.add_character(character)
            # 发送系统消息
            system_msg = Message(
                character_id="system",
                character_name="系统",
                content=f"{character.name} 加入了聊天室",
                is_system=True
            )
            room.add_message(system_msg)
            asyncio.create_task(self.notify_message_callbacks(room_id, system_msg))
            logger.info(f"角色 {character.name} 加入聊天室 {room.name}")
            return True
        return False
    
    def remove_character_from_room(self, room_id: str, character_id: str) -> bool:
        """从聊天室移除角色"""
        room = self.get_chat_room(room_id)
        if room:
            character = next((c for c in room.characters if c.id == character_id), None)
            if character:
                room.remove_character(character_id)
                # 发送系统消息
                system_msg = Message(
                    character_id="system",
                    character_name="系统",
                    content=f"{character.name} 离开了聊天室",
                    is_system=True
                )
                room.add_message(system_msg)
                asyncio.create_task(self.notify_message_callbacks(room_id, system_msg))
                logger.info(f"角色 {character.name} 离开聊天室 {room.name}")
                return True
        return False
    
    async def send_message(self, room_id: str, character_id: str, content: str) -> bool:
        """发送消息"""
        room = self.get_chat_room(room_id)
        if not room:
            return False
            
        character = next((c for c in room.characters if c.id == character_id), None)
        if not character:
            return False
            
        message = Message(
            character_id=character_id,
            character_name=character.name,
            content=content
        )
        
        room.add_message(message)
        await self.notify_message_callbacks(room_id, message)
        logger.info(f"{character.name} 在 {room.name} 中说: {content}")
        return True
    
    async def generate_ai_response(self, room_id: str, character_id: str) -> Optional[str]:
        """为指定角色生成AI回复"""
        room = self.get_chat_room(room_id)
        if not room:
            return None

        character = next((c for c in room.characters if c.id == character_id), None)
        if not character:
            return None

        # 根据隐身模式调整消息历史
        messages_for_ai = self._prepare_messages_for_ai(room, character)

        # 生成AI回复
        response = await ai_service.generate_response(character, messages_for_ai)
        if response:
            await self.send_message(room_id, character_id, response)
            return response
        return None

    async def stream_ai_response(
        self, room_id: str, character_id: str
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        为指定角色流式生成AI回复，逐片返回 token，并在完成后写入历史
        """
        room = self.get_chat_room(room_id)
        if not room:
            raise ValueError("聊天室不存在")

        character = next((c for c in room.characters if c.id == character_id), None)
        if not character:
            raise ValueError("角色不存在")

        messages_for_ai = self._prepare_messages_for_ai(room, character)
        message = Message(
            character_id=character_id,
            character_name=character.name,
            content=""
        )

        try:
            async for chunk in ai_service.stream_response(character, messages_for_ai):
                message.content += chunk
                yield {
                    "type": "chunk",
                    "content": chunk,
                    "message_id": message.id,
                    "character_id": character.id,
                    "character_name": character.name,
                }
        except Exception as e:
            logger.error(f"流式生成失败: {e}")
            yield {
                "type": "error",
                "message": "生成失败，请重试",
                "message_id": message.id,
                "character_id": character.id,
            }
            return

        # 最终落库并广播完整消息
        if message.content.strip():
            room.add_message(message)
            await self.notify_message_callbacks(room_id, message)

        yield {"type": "end", "message_id": message.id}

    def _prepare_messages_for_ai(self, room: ChatRoom, character: Character) -> List[Message]:
        """根据聊天室设置准备AI使用的消息历史"""
        messages = room.messages.copy()

        if room.stealth_mode:
            # 隐身模式：过滤掉用户消息，只保留AI角色之间的对话
            ai_messages = []
            for msg in messages:
                if msg.is_system:
                    ai_messages.append(msg)
                elif msg.character_id in [c.id for c in room.characters]:
                    # 只保留聊天室中AI角色的消息
                    ai_messages.append(msg)
                # 过滤掉用户消息
            messages = ai_messages
        else:
            # 非隐身模式：如果有用户描述，添加用户信息
            if room.user_description.strip():
                # 在消息开头添加用户描述信息
                user_info_msg = Message(
                    character_id="system",
                    character_name="系统",
                    content=f"用户信息：{room.user_description}",
                    is_system=True
                )
                messages = [user_info_msg] + messages

        return messages

    def update_room_settings(
        self,
        room_id: str,
        stealth_mode: Optional[bool] = None,
        user_description: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> bool:
        """更新聊天室设置"""
        room = self.get_chat_room(room_id)
        if not room:
            return False

        if stealth_mode is not None:
            room.stealth_mode = stealth_mode
            logger.info(f"聊天室 {room.name} 隐身模式: {'开启' if stealth_mode else '关闭'}")

        if user_description is not None:
            room.user_description = user_description
            logger.info(f"聊天室 {room.name} 用户描述已更新")

        if name is not None:
            old_name = room.name
            room.name = name
            logger.info(f"聊天室名称从 {old_name} 更改为 {name}")

        if description is not None:
            room.description = description
            logger.info(f"聊天室 {room.name} 描述已更新")

        return True

    async def auto_chat_loop(self, room_id: str, interval: int = 5):
        """自动聊天循环"""
        while True:
            try:
                room = self.get_chat_room(room_id)
                if not room or not room.is_auto_chat:
                    break
                    
                active_characters = room.get_active_characters()
                if len(active_characters) < 2:
                    await asyncio.sleep(interval)
                    continue
                
                # 随机选择一个角色发言
                # 避免同一个角色连续发言
                last_message = room.messages[-1] if room.messages else None
                available_characters = active_characters
                
                if last_message and not last_message.is_system:
                    available_characters = [
                        c for c in active_characters 
                        if c.id != last_message.character_id
                    ]
                
                if not available_characters:
                    available_characters = active_characters
                
                selected_character = random.choice(available_characters)
                await self.generate_ai_response(room_id, selected_character.id)
                
                # 等待间隔时间
                await asyncio.sleep(interval)
                
            except Exception as e:
                logger.error(f"自动聊天循环出错: {e}")
                await asyncio.sleep(interval)
    
    def start_auto_chat(self, room_id: str, interval: int = 5):
        """开始自动聊天"""
        room = self.get_chat_room(room_id)
        if room:
            room.is_auto_chat = True
            if room_id not in self.auto_chat_tasks:
                task = asyncio.create_task(self.auto_chat_loop(room_id, interval))
                self.auto_chat_tasks[room_id] = task
                logger.info(f"开始自动聊天: {room.name}")
    
    def stop_auto_chat(self, room_id: str):
        """停止自动聊天"""
        room = self.get_chat_room(room_id)
        if room:
            room.is_auto_chat = False
            if room_id in self.auto_chat_tasks:
                self.auto_chat_tasks[room_id].cancel()
                del self.auto_chat_tasks[room_id]
                logger.info(f"停止自动聊天: {room.name}")


# 全局聊天服务实例
chat_service = ChatService()
