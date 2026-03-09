import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class Character(BaseModel):
    """AI角色模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="角色名称")
    personality: str = Field(..., description="角色性格描述")
    background: str = Field(..., description="角色背景故事")
    speaking_style: str = Field(default="", description="说话风格")
    avatar: Optional[str] = Field(default=None, description="头像URL")
    is_active: bool = Field(default=True, description="是否激活")
    created_at: datetime = Field(default_factory=datetime.now)

    def get_system_prompt(self) -> str:
        """生成角色的系统提示词"""
        prompt = f"""你是{self.name}。

性格特点：{self.personality}

背景故事：{self.background}"""

        if self.speaking_style:
            prompt += f"\n\n说话风格：{self.speaking_style}"

        prompt += """

请根据你的角色设定来回应对话。保持角色的一致性，用符合你性格和背景的方式说话。
回复要简洁有趣，通常在1-3句话之间。不要重复别人刚说过的话。"""

        return prompt


class Message(BaseModel):
    """聊天消息模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    character_id: str = Field(..., description="发送者角色ID")
    character_name: str = Field(..., description="发送者角色名称")
    content: str = Field(..., description="消息内容")
    timestamp: datetime = Field(default_factory=datetime.now)
    is_system: bool = Field(default=False, description="是否为系统消息")


class ChatRoom(BaseModel):
    """聊天室模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="聊天室名称")
    description: str = Field(default="", description="聊天室描述")
    characters: List[Character] = Field(default_factory=list, description="参与的角色列表")
    messages: List[Message] = Field(default_factory=list, description="消息历史")
    is_auto_chat: bool = Field(default=False, description="是否自动聊天")
    max_history: int = Field(default=50, description="最大历史消息数")
    created_at: datetime = Field(default_factory=datetime.now)
    stealth_mode: bool = Field(default=False, description="隐身模式：用户对AI不可见")
    user_description: str = Field(default="", description="用户自我描述（非隐身模式下使用）")

    def add_character(self, character: Character):
        """添加角色到聊天室"""
        if character.id not in [c.id for c in self.characters]:
            self.characters.append(character)

    def remove_character(self, character_id: str):
        """从聊天室移除角色"""
        self.characters = [c for c in self.characters if c.id != character_id]

    def add_message(self, message: Message):
        """添加消息到聊天室"""
        self.messages.append(message)
        # 保持历史消息数量限制
        if len(self.messages) > self.max_history:
            self.messages = self.messages[-self.max_history:]

    def get_recent_messages(self, count: int = 10) -> List[Message]:
        """获取最近的消息"""
        return self.messages[-count:] if self.messages else []

    def get_active_characters(self) -> List[Character]:
        """获取激活的角色"""
        return [c for c in self.characters if c.is_active]
