"""
core.llm.provider — LLM Provider 接口定义

所有 Provider 实现必须满足此 Protocol，
使得 Orchestrator 和 Registry 可以泛化处理。
"""

from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable

from core.llm.types import ChatEvent, ChatRequest, ModelCapabilities


@runtime_checkable
class LLMProvider(Protocol):
    """LLM Provider 协议 — 所有 provider 必须实现"""

    @property
    def provider_name(self) -> str:
        """Provider 标识名，如 "openai_compat", "gemini" """
        ...

    def supported_models(self) -> list[str]:
        """返回此 Provider 支持的所有 model_id 列表"""
        ...

    def capabilities(self, model_id: str) -> ModelCapabilities:
        """返回指定模型的能力描述"""
        ...

    async def generate_stream(
        self, request: ChatRequest
    ) -> AsyncIterator[ChatEvent]:
        """
        流式生成。

        Yields:
            ChatEvent: DELTA 事件（逐 token） → 可选 USAGE 事件 → 不含 FINAL
            FINAL 由 Orchestrator 负责发出（因为需要关联落库与广播）。
            出错时 yield ERROR 事件。
        """
        ...

    async def test_connection(self, model_id: str) -> dict:
        """
        测试 API 连接。

        Returns:
            {"success": bool, "message": str, "latency_ms": float}
        """
        ...
