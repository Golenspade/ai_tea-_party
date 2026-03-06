"""
core.llm.types — 统一 LLM 类型定义

定义与 Provider 无关的请求/响应/能力/错误模型，
作为整个 LLM 抽象层的"合同"。
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ============================================================
# 消息与角色
# ============================================================


class ChatRole(str, Enum):
    """对话角色（对齐 OpenAI 风格）"""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    """单条对话消息"""

    role: ChatRole
    content: str
    name: Optional[str] = None  # 角色名（用于多角色区分）


# ============================================================
# 模型能力
# ============================================================


class ModelCapabilities(BaseModel):
    """某个具体模型的能力描述"""

    supports_tools: bool = False
    supports_json_schema: bool = False
    supports_vision: bool = False
    supports_streaming: bool = True
    max_context_tokens: int = 128_000
    max_output_tokens: int = 8_192


# ============================================================
# 请求
# ============================================================


class ChatRequest(BaseModel):
    """统一的 LLM 请求"""

    request_id: str = Field(default_factory=lambda: uuid4().hex)
    model_id: str  # e.g. "deepseek-chat", "gemini-3-flash-preview"
    messages: list[ChatMessage]
    temperature: float = 0.85
    max_tokens: Optional[int] = None
    stream: bool = True

    # 业务 metadata — 不会传给 LLM，供 Orchestrator 使用
    room_id: Optional[str] = None
    character_id: Optional[str] = None
    character_name: Optional[str] = None


# ============================================================
# 事件（流式响应）
# ============================================================


class EventType(str, Enum):
    """流式响应事件类型"""

    DELTA = "delta"  # token chunk
    TOOL_CALL = "tool_call"  # 工具调用（预留）
    FINAL = "final"  # 完整消息
    USAGE = "usage"  # token 统计
    ERROR = "error"  # 错误


class ChatEvent(BaseModel):
    """统一的流式响应事件"""

    type: EventType
    request_id: str

    # DELTA / FINAL
    content: Optional[str] = None

    # ERROR
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    # USAGE
    usage: Optional[dict] = None  # {"prompt_tokens": ..., "completion_tokens": ...}

    # FINAL
    latency_ms: Optional[float] = None


# ============================================================
# 错误
# ============================================================


class LLMErrorCode(str, Enum):
    """结构化错误码"""

    AUTH = "auth"
    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    INVALID_REQUEST = "invalid_request"
    PROVIDER_DOWN = "provider_down"
    UNKNOWN = "unknown"


class LLMError(Exception):
    """LLM 调用错误 — 可用于统一错误处理和重试判断"""

    def __init__(
        self,
        code: LLMErrorCode,
        message: str,
        retryable: bool = False,
        provider: Optional[str] = None,
    ):
        self.code = code
        self.message = message
        self.retryable = retryable
        self.provider = provider
        super().__init__(f"[{code.value}] {message}")
