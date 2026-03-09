import os
from typing import List, Optional, Dict, Any, AsyncGenerator, Union
import asyncio
import logging
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
from models.character import Character, Message
import litellm
from enum import Enum

# 确保环境变量已加载
load_dotenv()

# 降低 litellm 日志噪音
litellm.suppress_debug_info = True

logger = logging.getLogger(__name__)


class APIProvider(Enum):
    """API提供商枚举"""
    DEEPSEEK_CHAT = "deepseek_chat"
    DEEPSEEK_REASONER = "deepseek_reasoner"
    GEMINI_25_FLASH = "gemini_25_flash"
    GEMINI_25_PRO = "gemini_25_pro"
    GEMINI_3_FLASH = "gemini_3_flash"
    GEMINI_31_PRO = "gemini_31_pro"
    GEMINI_31_FLASH_LITE = "gemini_31_flash_lite"


class APIConfig:
    """API配置类"""
    def __init__(self, provider: APIProvider, api_key: str, model: Optional[str] = None):
        self.provider = provider
        self.api_key = api_key
        self.model = model or self._get_default_model()

    def _get_default_model(self) -> str:
        """获取默认模型名称"""
        model_map = {
            APIProvider.DEEPSEEK_CHAT: "deepseek-chat",
            APIProvider.DEEPSEEK_REASONER: "deepseek-reasoner",
            APIProvider.GEMINI_25_FLASH: "gemini-2.5-flash",
            APIProvider.GEMINI_25_PRO: "gemini-2.5-pro",
            APIProvider.GEMINI_3_FLASH: "gemini-3-flash-preview",
            APIProvider.GEMINI_31_PRO: "gemini-3.1-pro-preview",
            APIProvider.GEMINI_31_FLASH_LITE: "gemini-3.1-flash-lite-preview",
        }
        return model_map.get(self.provider, "deepseek-chat")


class CharacterMemory:
    """角色记忆系统 - 帮助AI记住其他角色的特征"""
    def __init__(self):
        self.character_profiles = {}  # 存储其他角色的特征
        self.interaction_history = {}  # 存储角色间的互动历史

    def update_character_profile(self, character_id: str, name: str, traits: List[str]):
        """更新角色特征档案"""
        self.character_profiles[character_id] = {
            "name": name,
            "traits": traits,
            "last_updated": datetime.now()
        }

    def get_character_context(self, character_id: str) -> str:
        """获取角色的上下文信息"""
        if character_id in self.character_profiles:
            profile = self.character_profiles[character_id]
            return f"{profile['name']}的特征：{', '.join(profile['traits'])}"
        return ""

    def analyze_character_from_messages(self, character_id: str, messages: List[Message]) -> List[str]:
        """从消息中分析角色特征"""
        character_messages = [msg for msg in messages if msg.character_id == character_id]
        if not character_messages:
            return []

        # 简单的特征分析
        traits = []
        content_text = " ".join([msg.content for msg in character_messages])

        # 分析语言风格
        if "哈哈" in content_text or "😄" in content_text:
            traits.append("幽默开朗")
        if "谢谢" in content_text or "感谢" in content_text:
            traits.append("礼貌")
        if len(content_text) / len(character_messages) > 50:
            traits.append("健谈")
        else:
            traits.append("简洁")

        return traits


# 所有使用 Gemini API 的 Provider
_GEMINI_PROVIDERS = frozenset({
    APIProvider.GEMINI_25_FLASH,
    APIProvider.GEMINI_25_PRO,
    APIProvider.GEMINI_3_FLASH,
    APIProvider.GEMINI_31_PRO,
    APIProvider.GEMINI_31_FLASH_LITE,
})

# 所有使用 DeepSeek API 的 Provider
_DEEPSEEK_PROVIDERS = frozenset({
    APIProvider.DEEPSEEK_CHAT,
    APIProvider.DEEPSEEK_REASONER,
})


class AIService:
    """AI服务类，处理与指定AI API的交互（已迁移至 LiteLLM）"""

    # LiteLLM 模型名映射
    _LITELLM_MODEL_MAP: Dict[str, str] = {
        "deepseek-chat": "deepseek/deepseek-chat",
        "deepseek-reasoner": "deepseek/deepseek-reasoner",
        "gemini-2.5-flash": "gemini/gemini-2.5-flash",
        "gemini-2.5-pro": "gemini/gemini-2.5-pro",
        "gemini-3-flash-preview": "gemini/gemini-3-flash-preview",
        "gemini-3.1-pro-preview": "gemini/gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite-preview": "gemini/gemini-3.1-flash-lite-preview",
    }

    def __init__(self):
        # 当前配置，可以动态更新
        self.current_config: Optional[APIConfig] = None
        self.character_memory = CharacterMemory()

        # API健康检查相关
        self.last_health_check = None
        self.health_check_interval = 300  # 5分钟检查一次
        self.api_status = "unknown"  # unknown, healthy, error
        self.last_error = None

        # 从环境变量加载默认配置
        self._load_default_config()

    def _load_default_config(self):
        """从环境变量加载默认配置"""
        provider_str = os.getenv("AI_PROVIDER", "deepseek_chat").lower()

        # 映射字符串到枚举
        provider_map = {
            "deepseek_chat": APIProvider.DEEPSEEK_CHAT,
            "deepseek_reasoner": APIProvider.DEEPSEEK_REASONER,
            "gemini_25_flash": APIProvider.GEMINI_25_FLASH,
            "gemini_25_pro": APIProvider.GEMINI_25_PRO,
            "gemini_3_flash": APIProvider.GEMINI_3_FLASH,
            "gemini_31_pro": APIProvider.GEMINI_31_PRO,
            "gemini_31_flash_lite": APIProvider.GEMINI_31_FLASH_LITE,
        }

        provider = provider_map.get(provider_str, APIProvider.DEEPSEEK_CHAT)

        # 获取对应的API密钥
        api_key = self._get_api_key_for_provider(provider)

        if api_key:
            self.current_config = APIConfig(provider, api_key)

    def _get_api_key_for_provider(self, provider: APIProvider) -> Optional[str]:
        """根据提供商获取API密钥"""
        if provider in _DEEPSEEK_PROVIDERS:
            return os.getenv("DEEPSEEK_API_KEY")
        elif provider in _GEMINI_PROVIDERS:
            return os.getenv("GEMINI_API_KEY")
        return None

    def _get_litellm_model(self) -> Optional[str]:
        """获取当前配置对应的 LiteLLM 模型名"""
        if not self.current_config or not self.current_config.model:
            return None
        return self._LITELLM_MODEL_MAP.get(
            self.current_config.model, self.current_config.model
        )

    def update_config(self, provider: APIProvider, api_key: str, model: Optional[str] = None):
        """动态更新API配置"""
        self.current_config = APIConfig(provider, api_key, model)
        logger.info(f"API配置已更新: {provider.value}")

        # 重置健康检查状态
        self.last_health_check = None
        self.api_status = "unknown"
        self.last_error = None

    async def generate_response(
        self,
        character: Character,
        conversation_history: List[Message],
        max_tokens: int = 1000
    ) -> Optional[str]:
        """
        为指定角色生成回复，支持多轮对话和角色识别

        Args:
            character: AI角色
            conversation_history: 对话历史
            max_tokens: 最大token数

        Returns:
            生成的回复内容
        """
        if not self.current_config:
            error_msg = "AI服务未配置，请先在设置中配置API密钥"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # 更新角色记忆系统
        self._update_character_memory(conversation_history)

        try:
            provider = self.current_config.provider

            if provider in _DEEPSEEK_PROVIDERS:
                return await self._generate_response_via_litellm(character, conversation_history, max_tokens)
            elif provider in _GEMINI_PROVIDERS:
                return await self._generate_response_via_litellm(character, conversation_history, max_tokens)
            else:
                logger.error(f"不支持的API提供商: {provider}")
                return None

        except Exception as e:
            logger.error(f"生成AI回复时出错: {e}")
            return None

    async def stream_response(
        self,
        character: Character,
        conversation_history: List[Message],
        max_tokens: int = 1000
    ) -> AsyncGenerator[str, None]:
        """
        为指定角色流式生成回复，逐片返回文本
        """
        if not self.current_config:
            error_msg = "AI服务未配置，请先在设置中配置API密钥"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # 更新角色记忆系统
        self._update_character_memory(conversation_history)

        provider = self.current_config.provider

        if provider in _DEEPSEEK_PROVIDERS or provider in _GEMINI_PROVIDERS:
            async for chunk in self._stream_response_via_litellm(
                character, conversation_history, max_tokens
            ):
                yield chunk
        else:
            logger.error(f"不支持的API提供商: {provider}")

    def _build_deepseek_messages(
        self, character: Character, conversation_history: List[Message]
    ) -> List[Dict[str, str]]:
        """构建 DeepSeek 兼容的对话消息列表"""
        enhanced_system_prompt = self._build_enhanced_system_prompt(
            character, conversation_history
        )

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": enhanced_system_prompt}
        ]

        recent_messages = conversation_history[-25:] if conversation_history else []
        for msg in recent_messages:
            if msg.is_system:
                continue

            role = "assistant" if msg.character_id == character.id else "user"
            content = msg.content if msg.character_id == character.id else f"[{msg.character_name}]: {msg.content}"

            messages.append({"role": role, "content": content})

        return messages

    def _update_character_memory(self, conversation_history: List[Message]):
        """更新角色记忆系统"""
        # 分析最近的消息，更新角色特征
        recent_messages = conversation_history[-20:] if conversation_history else []

        # 获取所有活跃角色
        active_characters = set()
        for msg in recent_messages:
            if not msg.is_system:
                active_characters.add((msg.character_id, msg.character_name))

        # 为每个角色分析特征
        for char_id, char_name in active_characters:
            traits = self.character_memory.analyze_character_from_messages(char_id, recent_messages)
            if traits:
                self.character_memory.update_character_profile(char_id, char_name, traits)

    async def _generate_response_via_litellm(
        self,
        character: Character,
        conversation_history: List[Message],
        max_tokens: int
    ) -> Optional[str]:
        """使用 LiteLLM 统一生成回复"""
        litellm_model = self._get_litellm_model()
        if not litellm_model or not self.current_config:
            logger.error("LiteLLM 配置无效")
            return None

        messages = self._build_deepseek_messages(character, conversation_history)

        try:
            kwargs: Dict[str, Any] = {
                "model": litellm_model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.8,
                "api_key": self.current_config.api_key,
            }

            # DeepSeek Reasoner 需要更多 token 来完成推理并输出最终答案
            if litellm_model == "deepseek/deepseek-reasoner":
                kwargs["max_tokens"] = max(max_tokens, 4096)

            # 对非 Gemini 模型添加 penalty 参数
            if not litellm_model.startswith("gemini/"):
                kwargs["presence_penalty"] = 0.6
                kwargs["frequency_penalty"] = 0.3

            response = await litellm.acompletion(**kwargs)

            if response.choices:
                content = response.choices[0].message.content or ""
                if content.strip():
                    content = content.strip()
                    if content.startswith(f"{character.name}:"):
                        content = content[len(f"{character.name}:"):].strip()
                    return content

        except Exception as e:
            logger.error(f"LiteLLM API调用失败: {e}")
            return None

        return None

    async def _stream_response_via_litellm(
        self,
        character: Character,
        conversation_history: List[Message],
        max_tokens: int
    ) -> AsyncGenerator[str, None]:
        """使用 LiteLLM 统一流式生成回复"""
        litellm_model = self._get_litellm_model()
        if not litellm_model or not self.current_config:
            logger.error("LiteLLM 配置无效")
            return

        messages = self._build_deepseek_messages(character, conversation_history)

        try:
            kwargs: Dict[str, Any] = {
                "model": litellm_model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.8,
                "stream": True,
                "api_key": self.current_config.api_key,
            }

            # DeepSeek Reasoner 需要更多 token
            if litellm_model == "deepseek/deepseek-reasoner":
                kwargs["max_tokens"] = max(max_tokens, 4096)

            if not litellm_model.startswith("gemini/"):
                kwargs["presence_penalty"] = 0.6
                kwargs["frequency_penalty"] = 0.3

            response = await litellm.acompletion(**kwargs)

            async for chunk in response:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                # 只输出 content，不输出 reasoning_content（内部思维链）
                if delta and delta.content:
                    yield delta.content

        except Exception as e:
            logger.error(f"LiteLLM 流式API调用失败: {e}")

    def _build_enhanced_system_prompt(self, character: Character, conversation_history: List[Message]) -> str:
        """构建包含角色记忆的增强系统提示"""
        base_prompt = character.get_system_prompt()

        # 添加角色记忆信息
        memory_context = self._get_character_memory_context(character.id, conversation_history)

        # 分析对话情境
        context_analysis = self._analyze_conversation_context(conversation_history[-10:], character)

        enhanced_prompt = f"""{base_prompt}

【角色记忆】
{memory_context}

【对话情境分析】
{context_analysis}

【回复指导】
1. 保持角色一致性，体现你的性格特点
2. 记住并参考其他角色的特征和说话风格
3. 根据对话情境调整回复的长度和风格
4. 可以引用之前的对话内容，体现连续性
5. 回复要自然流畅，避免重复他人刚说的话

请以{character.name}的身份自然回复："""

        return enhanced_prompt

    def _build_enhanced_prompt_for_gemini(self, character: Character, conversation_history: List[Message]) -> str:
        """为Gemini构建增强提示词"""
        base_prompt = character.get_system_prompt()

        # 构建对话历史
        conversation_text = ""
        recent_messages = conversation_history[-20:] if conversation_history else []
        for msg in recent_messages:
            if not msg.is_system:
                conversation_text += f"[{msg.character_name}]: {msg.content}\n"

        # 获取角色记忆
        memory_context = self._get_character_memory_context(character.id, conversation_history)

        # 分析对话情境
        context_analysis = self._analyze_conversation_context(recent_messages, character)

        full_prompt = f"""【角色设定】
{base_prompt}

【其他角色信息】
{memory_context}

【对话历史】
{conversation_text}

【情境分析】
{context_analysis}

请以{character.name}的身份，根据以上信息自然地回复。注意：
- 保持角色一致性
- 体现对其他角色的了解和记忆
- 根据对话情境调整回复风格
- 可以适当引用之前的对话内容

{character.name}的回复："""

        return full_prompt

    def _get_character_memory_context(self, current_character_id: str, conversation_history: List[Message]) -> str:
        """获取角色记忆上下文"""
        memory_lines = []

        # 获取聊天室中的其他角色
        other_characters = set()
        for msg in conversation_history:
            if not msg.is_system and msg.character_id != current_character_id:
                other_characters.add((msg.character_id, msg.character_name))

        # 为每个其他角色添加记忆信息
        for char_id, char_name in other_characters:
            context = self.character_memory.get_character_context(char_id)
            if context:
                memory_lines.append(context)
            else:
                # 如果没有记忆，从最近消息中快速分析
                char_messages = [msg for msg in conversation_history[-15:]
                               if msg.character_id == char_id]
                if char_messages:
                    recent_content = " ".join([msg.content for msg in char_messages[-3:]])
                    memory_lines.append(f"{char_name}最近说过：{recent_content}")

        return "\n".join(memory_lines) if memory_lines else "暂无其他角色的详细信息"

    def _analyze_conversation_context(self, recent_messages: List[Message], character: Character) -> str:
        """分析对话情境"""
        if not recent_messages:
            return "对话刚开始，建议主动开启话题"

        # 分析最近的消息特征
        message_count = len(recent_messages)
        last_message = recent_messages[-1] if recent_messages else None

        # 分析对话节奏
        if message_count <= 3:
            rhythm = "对话初期"
        elif message_count <= 8:
            rhythm = "对话进行中"
        else:
            rhythm = "对话深入"

        # 分析最后一条消息
        analysis_parts = [f"对话状态：{rhythm}"]

        if last_message and not last_message.is_system:
            last_content = last_message.content

            # 检查是否包含问题
            if "?" in last_content or "？" in last_content or "吗" in last_content or "呢" in last_content:
                analysis_parts.append("需要回答问题")

            # 检查情绪
            if any(word in last_content for word in ["哈哈", "开心", "高兴", "好的"]):
                analysis_parts.append("氛围轻松愉快")
            elif any(word in last_content for word in ["难过", "伤心", "不好", "糟糕"]):
                analysis_parts.append("需要给予关怀")

            # 检查消息长度
            if len(last_content) > 50:
                analysis_parts.append("对方说得较多，可以详细回应")
            else:
                analysis_parts.append("对方简洁回复，保持简洁即可")

        # 检查角色参与度
        character_recent = [msg for msg in recent_messages[-5:]
                          if msg.character_id == character.id]
        if not character_recent:
            analysis_parts.append("你还未参与此轮对话")
        elif len(character_recent) >= 2:
            analysis_parts.append("你已经连续发言，可以让其他人说话")

        return "；".join(analysis_parts)

    def is_configured(self) -> bool:
        """检查AI服务是否已正确配置"""
        return self.current_config is not None and self.current_config.api_key is not None

    def get_current_config(self) -> Optional[Dict[str, Any]]:
        """获取当前配置信息"""
        if not self.current_config:
            return None

        return {
            "provider": self.current_config.provider.value,
            "model": self.current_config.model,
            "has_api_key": bool(self.current_config.api_key)
        }

    @staticmethod
    def get_available_providers() -> Dict[str, Dict[str, Any]]:
        """获取可用的API提供商和模型"""
        return {
            "deepseek_chat": {
                "name": "DeepSeek Chat",
                "models": ["deepseek-chat"],
                "requires_key": "DEEPSEEK_API_KEY",
                "description": "DeepSeek V3.2 聊天模型，适合日常对话"
            },
            "deepseek_reasoner": {
                "name": "DeepSeek Reasoner",
                "models": ["deepseek-reasoner"],
                "requires_key": "DEEPSEEK_API_KEY",
                "description": "DeepSeek V3.2 推理模型，具有更强的逻辑推理能力"
            },
            "gemini_25_flash": {
                "name": "Gemini 2.5 Flash",
                "models": ["gemini-2.5-flash"],
                "requires_key": "GEMINI_API_KEY",
                "description": "Google Gemini 2.5 Flash，快速且高效"
            },
            "gemini_25_pro": {
                "name": "Gemini 2.5 Pro",
                "models": ["gemini-2.5-pro"],
                "requires_key": "GEMINI_API_KEY",
                "description": "Google Gemini 2.5 Pro，强大的理解和推理能力"
            },
            "gemini_3_flash": {
                "name": "Gemini 3 Flash",
                "models": ["gemini-3-flash-preview"],
                "requires_key": "GEMINI_API_KEY",
                "description": "Google Gemini 3 Flash，前沿性能，速度快成本低"
            },
            "gemini_31_pro": {
                "name": "Gemini 3.1 Pro",
                "models": ["gemini-3.1-pro-preview"],
                "requires_key": "GEMINI_API_KEY",
                "description": "Google Gemini 3.1 Pro，最强推理和编程能力"
            },
            "gemini_31_flash_lite": {
                "name": "Gemini 3.1 Flash Lite",
                "models": ["gemini-3.1-flash-lite-preview"],
                "requires_key": "GEMINI_API_KEY",
                "description": "Google Gemini 3.1 Flash Lite，高性价比的轻量模型"
            },
        }

    async def test_api_connection(self) -> Dict[str, Any]:
        """测试API连接"""
        if not self.current_config:
            return {
                "success": False,
                "error": "API未配置",
                "status": "not_configured"
            }

        try:
            # 创建测试消息
            test_character = Character(
                name="测试助手",
                personality="简洁友好",
                background="API连接测试角色"
            )

            test_message = Message(
                content="请简单回复'连接成功'",
                character_id="test",
                character_name="测试",
                is_system=False
            )

            # 测试API调用
            start_time = time.time()
            response = await self.generate_response(test_character, [test_message], max_tokens=20)
            response_time = time.time() - start_time

            # 更新健康状态
            self.api_status = "healthy"
            self.last_health_check = datetime.now()
            self.last_error = None

            return {
                "success": True,
                "provider": self.current_config.provider.value,
                "model": self.current_config.model,
                "response_time": round(response_time, 2),
                "status": "healthy",
                "message": "API连接正常",
                "test_response": response
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(f"API连接测试失败: {error_msg}")

            # 更新健康状态
            self.api_status = "error"
            self.last_health_check = datetime.now()
            self.last_error = error_msg

            return {
                "success": False,
                "error": error_msg,
                "status": "error",
                "provider": self.current_config.provider.value if self.current_config else "unknown"
            }

    async def check_api_health(self) -> bool:
        """检查API健康状态（周期性调用）"""
        if not self.current_config:
            return False

        # 检查是否需要进行健康检查
        now = datetime.now()
        if (self.last_health_check and
            (now - self.last_health_check).total_seconds() < self.health_check_interval):
            return self.api_status == "healthy"

        # 执行健康检查
        try:
            result = await self.test_api_connection()
            return result["success"]
        except Exception as e:
            logger.warning(f"健康检查失败: {e}")
            self.api_status = "error"
            self.last_error = str(e)
            return False

    def get_api_status(self) -> Dict[str, Any]:
        """获取API状态信息"""
        if not self.current_config:
            return {
                "status": "not_configured",
                "message": "API未配置"
            }

        return {
            "status": self.api_status,
            "provider": self.current_config.provider.value,
            "model": self.current_config.model,
            "last_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "last_error": self.last_error,
            "message": self._get_status_message()
        }

    def _get_status_message(self) -> str:
        """获取状态描述信息"""
        if self.api_status == "healthy":
            return "API连接正常"
        elif self.api_status == "error":
            return f"API连接异常: {self.last_error}"
        else:
            return "API状态未知，请测试连接"


# 全局AI服务实例
ai_service = AIService()
