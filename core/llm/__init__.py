"""
core.llm — LLM 抽象层

提供统一的 LLM 调用接口，支持多 Provider 插件化接入。
"""

from core.llm.provider import LLMProvider
from core.llm.registry import ProviderRegistry
from core.llm.types import (
    ChatEvent,
    ChatMessage,
    ChatRequest,
    ChatRole,
    EventType,
    LLMError,
    LLMErrorCode,
    ModelCapabilities,
)

__all__ = [
    "ChatRole",
    "ChatMessage",
    "ChatRequest",
    "ChatEvent",
    "EventType",
    "ModelCapabilities",
    "LLMError",
    "LLMErrorCode",
    "LLMProvider",
    "ProviderRegistry",
]
