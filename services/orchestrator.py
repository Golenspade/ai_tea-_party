"""
services.orchestrator — 聊天编排层

将 Character/Room/Memory 转为标准 ChatRequest，
调用 Provider 生成流，并负责消息落库和广播。

取代了原 AIService 中的业务逻辑部分。
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, AsyncIterator, Callable, Dict, Optional

from core.llm import (
    ChatEvent,
    ChatMessage,
    ChatRequest,
    ChatRole,
    EventType,
    LLMError,
    ProviderRegistry,
)
from core.prompt.assembler import PromptAssembler
from models.character import Character, ChatRoom, Message
from models.persona import Persona
from models.world_info import WorldInfoBook
from services.variables import get_variable_context

logger = logging.getLogger(__name__)


class CharacterMemory:
    """角色记忆系统 — 帮助 AI 记住其他角色的特征。"""

    def __init__(self) -> None:
        self.character_profiles: Dict[str, Dict[str, Any]] = {}

    def update_character_profile(
        self, character_id: str, name: str, traits: list[str]
    ) -> None:
        self.character_profiles[character_id] = {
            "name": name,
            "traits": traits,
            "last_updated": datetime.now(),
        }

    def get_character_context(self, character_id: str) -> str:
        if character_id in self.character_profiles:
            profile = self.character_profiles[character_id]
            return f"{profile['name']}的特征：{', '.join(profile['traits'])}"
        return ""

    def analyze_character_from_messages(
        self, character_id: str, messages: list[Message]
    ) -> list[str]:
        """从消息中分析角色特征。"""
        character_messages = [
            msg for msg in messages if msg.character_id == character_id
        ]
        if not character_messages:
            return []

        traits = []
        content_text = " ".join([msg.content for msg in character_messages])

        if "哈哈" in content_text or "😄" in content_text:
            traits.append("幽默开朗")
        if "谢谢" in content_text or "感谢" in content_text:
            traits.append("礼貌")
        if len(content_text) / len(character_messages) > 50:
            traits.append("健谈")
        else:
            traits.append("简洁")

        return traits


class ChatOrchestrator:
    """
    聊天编排器。

    核心职责：
    1. 将 Character/Room/Memory 转为标准 ChatRequest
    2. 根据 capability 做协商/降级
    3. 将 Provider 事件流加工为业务事件（落库、广播）
    """

    def __init__(
        self,
        registry: ProviderRegistry,
        current_model_id: str = "deepseek-chat",
    ) -> None:
        self.registry = registry
        self.current_model_id = current_model_id
        self.character_memory = CharacterMemory()
        self.prompt_assembler = PromptAssembler()
        self.response_length: str = "default"  # short / default / long
        self._message_callbacks: list[Callable] = []

    def add_message_callback(self, callback: Callable) -> None:
        """注册消息回调（用于 WS 广播）。"""
        self._message_callbacks.append(callback)

    async def _notify_callbacks(self, room_id: str, message: Message) -> None:
        """通知所有消息回调。"""
        for callback in self._message_callbacks:
            try:
                await callback(room_id, message)
            except Exception as e:
                logger.error(f"消息回调失败: {e}")

    async def generate(
        self,
        room: ChatRoom,
        character: Character,
        messages_for_ai: list[Message],
    ) -> AsyncIterator[ChatEvent]:
        """
        编排一次完整的 AI 生成流程。

        Yields:
            ChatEvent: DELTA → USAGE → FINAL（或 ERROR）
        """
        # 1. 更新角色记忆
        self._update_character_memory(messages_for_ai)

        # 2. 构建 ChatRequest
        provider = self.registry.get_provider(self.current_model_id)
        variable_context = await get_variable_context(room.id)
        chat_messages = self._build_openai_messages(
            character, messages_for_ai, variable_context=variable_context
        )

        request = ChatRequest(
            model_id=self.current_model_id,
            messages=chat_messages,
            room_id=room.id,
            character_id=character.id,
            character_name=character.name,
            max_tokens=4096,
        )

        # 3. 调用 Provider 流式生成
        accumulated = ""
        start_time = time.monotonic()
        had_error = False

        async for event in provider.generate_stream(request):
            if event.type == EventType.DELTA and event.content:
                accumulated += event.content
            elif event.type == EventType.ERROR:
                had_error = True

            yield event

        # 4. 流结束后：写入消息 + 广播
        if not had_error and accumulated.strip():
            # 清理回复内容
            content = accumulated.strip()
            if content.startswith(f"{character.name}:"):
                content = content[len(f"{character.name}:"):].strip()

            msg = Message(
                character_id=character.id,
                character_name=character.name,
                content=content,
            )
            room.add_message(msg)
            await self._notify_callbacks(room.id, msg)

            # 发送 FINAL 事件
            elapsed = (time.monotonic() - start_time) * 1000
            yield ChatEvent(
                type=EventType.FINAL,
                request_id=request.request_id,
                content=content,
                latency_ms=round(elapsed, 1),
            )
        elif not had_error:
            # 没有错误但也没有内容
            yield ChatEvent(
                type=EventType.FINAL,
                request_id=request.request_id,
                content="",
            )

    async def generate_non_stream(
        self,
        room: ChatRoom,
        character: Character,
        messages_for_ai: list[Message],
    ) -> Optional[str]:
        """非流式生成（用于自动聊天等）。"""
        accumulated = ""
        async for event in self.generate(room, character, messages_for_ai):
            if event.type == EventType.DELTA and event.content:
                accumulated += event.content
            elif event.type == EventType.FINAL:
                return event.content
            elif event.type == EventType.ERROR:
                logger.error(f"生成失败: {event.error_message}")
                return None
        return accumulated if accumulated.strip() else None

    async def test_connection(self) -> dict:
        """测试当前模型的 API 连接。"""
        try:
            provider = self.registry.get_provider(self.current_model_id)
            return await provider.test_connection(self.current_model_id)
        except LLMError as e:
            return {"success": False, "message": e.message}

    def update_model(self, model_id: str) -> None:
        """切换当前使用的模型。"""
        # 验证模型是否已注册
        self.registry.get_provider(model_id)
        self.current_model_id = model_id
        logger.info(f"已切换模型: {model_id}")

    def update_response_length(self, length: str) -> None:
        """切换回复长度偏好。"""
        if length not in ("short", "default", "long"):
            raise ValueError(f"无效的回复长度: {length}，应为 short/default/long")
        self.response_length = length
        logger.info(f"已切换回复长度: {length}")

    def is_configured(self) -> bool:
        """检查是否有可用模型。"""
        return self.registry.has_model(self.current_model_id)

    def get_current_config(self) -> Optional[dict]:
        """获取当前配置。"""
        if not self.is_configured():
            return None
        provider = self.registry.get_provider(self.current_model_id)
        return {
            "provider": provider.provider_name,
            "model": self.current_model_id,
            "has_api_key": True,
        }

    def get_available_models(self) -> list[dict]:
        """获取所有可用模型。"""
        return self.registry.list_models()

    # ------------------------------------------------------------------
    # 消息构建
    # ------------------------------------------------------------------

    def _build_openai_messages(
        self,
        character: Character,
        conversation_history: list[Message],
        persona: Persona | None = None,
        world_info_books: list[WorldInfoBook] | None = None,
        room_scenario: str = "",
        variable_context: dict[str, dict[str, object]] | None = None,
    ) -> list[ChatMessage]:
        """构建 OpenAI 兼容的消息列表。

        委托给 PromptAssembler 按槽位组装，然后追加角色记忆
        和对话情境分析作为补充系统消息。
        """
        # PromptAssembler 做核心组装（包含 PHI 长度约束）
        messages = self.prompt_assembler.assemble(
            character=character,
            chat_history=conversation_history,
            persona=persona,
            world_info_books=world_info_books,
            room_scenario=room_scenario,
            response_length=self.response_length,
            variable_context=variable_context,
        )

        # 追加角色记忆系统的上下文（补充知识）
        memory_context = self._get_character_memory_context(
            character.id, conversation_history
        )
        if memory_context.strip():
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM,
                content=f"【角色记忆】\n{memory_context}",
            ))

        # 追加对话情境分析
        context_analysis = self._analyze_conversation_context(
            conversation_history[-10:], character
        )
        if context_analysis.strip():
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM,
                content=f"【对话情境分析】\n{context_analysis}",
            ))

        return messages


    # ------------------------------------------------------------------
    # 角色记忆
    # ------------------------------------------------------------------

    def _get_character_memory_context(
        self,
        current_character_id: str,
        conversation_history: list[Message],
    ) -> str:
        memory_lines = []
        other_characters = set()
        for msg in conversation_history:
            if not msg.is_system and msg.character_id != current_character_id:
                other_characters.add((msg.character_id, msg.character_name))

        for char_id, char_name in other_characters:
            context = self.character_memory.get_character_context(char_id)
            if context:
                memory_lines.append(context)
            else:
                char_messages = [
                    msg
                    for msg in conversation_history[-15:]
                    if msg.character_id == char_id
                ]
                if char_messages:
                    recent_content = " ".join(
                        [msg.content for msg in char_messages[-3:]]
                    )
                    memory_lines.append(f"{char_name}最近说过：{recent_content}")

        return "\n".join(memory_lines) if memory_lines else "暂无其他角色的详细信息"

    def _analyze_conversation_context(
        self,
        recent_messages: list[Message],
        character: Character,
    ) -> str:
        if not recent_messages:
            return "对话刚开始，建议主动开启话题"

        message_count = len(recent_messages)
        last_message = recent_messages[-1] if recent_messages else None

        if message_count <= 3:
            rhythm = "对话初期"
        elif message_count <= 8:
            rhythm = "对话进行中"
        else:
            rhythm = "对话深入"

        analysis_parts = [f"对话状态：{rhythm}"]

        if last_message and not last_message.is_system:
            last_content = last_message.content
            if any(c in last_content for c in ["?", "？", "吗", "呢"]):
                analysis_parts.append("需要回答问题")
            if any(w in last_content for w in ["哈哈", "开心", "高兴", "好的"]):
                analysis_parts.append("氛围轻松愉快")
            elif any(w in last_content for w in ["难过", "伤心", "不好", "糟糕"]):
                analysis_parts.append("需要给予关怀")
            if len(last_content) > 50:
                analysis_parts.append("对方说得较多，可以详细回应")
            else:
                analysis_parts.append("对方简洁回复，保持简洁即可")

        character_recent = [
            msg for msg in recent_messages[-5:] if msg.character_id == character.id
        ]
        if not character_recent:
            analysis_parts.append("你还未参与此轮对话")
        elif len(character_recent) >= 2:
            analysis_parts.append("你已经连续发言，可以让其他人说话")

        return "；".join(analysis_parts)

    def _update_character_memory(self, conversation_history: list[Message]) -> None:
        recent = conversation_history[-20:] if conversation_history else []
        active_characters = set()
        for msg in recent:
            if not msg.is_system:
                active_characters.add((msg.character_id, msg.character_name))

        for char_id, char_name in active_characters:
            traits = self.character_memory.analyze_character_from_messages(
                char_id, recent
            )
            if traits:
                self.character_memory.update_character_profile(
                    char_id, char_name, traits
                )
