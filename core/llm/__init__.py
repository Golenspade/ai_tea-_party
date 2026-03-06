"""
core.llm — LLM 抽象层

提供统一的 LLM 调用接口，支持多 Provider 插件化接入。
"""

from core.llm.types import (
    ChatRole,
    ChatMessage,
    ChatRequest,
    ChatEvent,
    EventType,
    ModelCapabilities,
    LLMError,
    LLMErrorCode,
)
from core.llm.provider import LLMProvider
from core.llm.registry import ProviderRegistry

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
