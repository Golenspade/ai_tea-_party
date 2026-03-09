"""
配置加载器 - 从 config.json 加载预设的聊天室和角色
"""
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

from models.character import Character, ChatRoom
from services.chat_service import chat_service

logger = logging.getLogger(__name__)


class ConfigLoader:
    """配置加载器"""

    def __init__(self, config_path: str = "config.json"):
        self.config_path = Path(config_path)
        self.config_data: Optional[Dict] = None

    def load_config(self) -> bool:
        """加载配置文件"""
        try:
            if not self.config_path.exists():
                logger.warning(f"配置文件不存在: {self.config_path}")
                return False

            with open(self.config_path, 'r', encoding='utf-8') as f:
                self.config_data = json.load(f)

            logger.info(f"成功加载配置文件: {self.config_path}")
            return True
        except Exception as e:
            logger.error(f"加载配置文件失败: {e}")
            return False

    def initialize_rooms(self) -> List[ChatRoom]:
        """初始化所有预设聊天室"""
        if not self.config_data:
            logger.warning("配置数据为空，无法初始化聊天室")
            return []

        rooms = []
        rooms_config = self.config_data.get('rooms', [])

        for room_config in rooms_config:
            try:
                room = self._create_room_from_config(room_config)
                if room:
                    rooms.append(room)
                    logger.info(f"成功创建聊天室: {room.name} (ID: {room.id})")
            except Exception as e:
                logger.error(f"创建聊天室失败: {e}")
                continue

        return rooms

    def _create_room_from_config(self, room_config: Dict) -> Optional[ChatRoom]:
        """从配置创建聊天室"""
        try:
            # 创建聊天室
            room = chat_service.create_chat_room(
                name=room_config.get('name', 'Unnamed Room'),
                description=room_config.get('description', ''),
                stealth_mode=room_config.get('stealth_mode', False),
                user_description=room_config.get('user_description', '')
            )

            # 如果指定了自定义 ID，则覆盖
            if 'id' in room_config:
                custom_id = room_config['id']
                # 删除原来的房间
                if room.id in chat_service.chat_rooms:
                    del chat_service.chat_rooms[room.id]
                # 使用自定义 ID
                room.id = custom_id
                chat_service.chat_rooms[custom_id] = room

            # 添加角色（直接添加，不触发系统消息）
            characters_config = room_config.get('characters', [])
            for char_config in characters_config:
                character = Character(
                    name=char_config.get('name', 'Unnamed'),
                    personality=char_config.get('personality', ''),
                    background=char_config.get('background', ''),
                    speaking_style=char_config.get('speaking_style', '')
                )
                # 直接添加到房间，避免触发异步回调
                room.add_character(character)
                logger.info(f"  添加角色: {character.name}")

            return room
        except Exception as e:
            logger.error(f"创建聊天室失败: {e}")
            return None

    def get_room_config(self, room_id: str) -> Optional[Dict]:
        """获取指定聊天室的配置"""
        if not self.config_data:
            return None

        rooms = self.config_data.get('rooms', [])
        for room in rooms:
            if room.get('id') == room_id:
                return room
        return None

    def get_all_room_ids(self) -> List[str]:
        """获取所有预设聊天室的 ID"""
        if not self.config_data:
            return []

        rooms = self.config_data.get('rooms', [])
        return [room.get('id', '') for room in rooms if 'id' in room]


# 全局配置加载器实例
config_loader = ConfigLoader()
