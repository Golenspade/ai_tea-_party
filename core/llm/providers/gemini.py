"""
core.llm.providers.gemini — Google Gemini Provider

使用 google-genai SDK 的异步流式 API。
"""

from __future__ import annotations

import logging
import time
from typing import AsyncIterator

from google import genai
from google.genai import types as genai_types

from core.llm.types import (
    ChatEvent,
    ChatRequest,
    EventType,
    LLMError,
    LLMErrorCode,
    ModelCapabilities,
)

logger = logging.getLogger(__name__)


class GeminiProvider:
    """
    Google Gemini Provider。

    用法：
        provider = GeminiProvider(
            api_key="AIza...",
            models={
                "gemini-2.5-flash": ModelCapabilities(max_context_tokens=1_000_000),
                "gemini-3-flash-preview": ModelCapabilities(max_context_tokens=1_000_000),
            },
        )
    """

    def __init__(
        self,
        *,
        api_key: str,
        models: dict[str, ModelCapabilities],
    ):
        self._models = models
        self._client = genai.Client(api_key=api_key)

    @property
    def provider_name(self) -> str:
        return "gemini"

    def supported_models(self) -> list[str]:
        return list(self._models.keys())

    def capabilities(self, model_id: str) -> ModelCapabilities:
        if model_id not in self._models:
            raise LLMError(
                code=LLMErrorCode.INVALID_REQUEST,
                message=f"Model '{model_id}' not supported by Gemini provider",
            )
        return self._models[model_id]

    async def generate_stream(
        self, request: ChatRequest
    ) -> AsyncIterator[ChatEvent]:
        """
        流式生成。

        Gemini 使用单一 prompt 字符串（非 messages 数组），
        由 Orchestrator 负责将 ChatMessage 列表组合成 prompt。

        如果 messages 中有 system + user/assistant 序列，
        此 Provider 将自动转为 Gemini 支持的格式。
        """
        prompt = self._build_prompt(request)
        start_time = time.monotonic()
        usage: dict | None = None

        config = genai_types.GenerateContentConfig(
            max_output_tokens=request.max_tokens or 1000,
            temperature=request.temperature,
        )

        try:
            async for chunk in self._client.aio.models.generate_content_stream(
                model=request.model_id,
                contents=prompt,
                config=config,
            ):
                if chunk.text:
                    yield ChatEvent(
                        type=EventType.DELTA,
                        request_id=request.request_id,
                        content=chunk.text,
                    )

                # 提取 usage（如果有）— 取最后一次出现的值
                if chunk.usage_metadata:
                    usage = {
                        "prompt_tokens": chunk.usage_metadata.prompt_token_count or 0,
                        "completion_tokens": chunk.usage_metadata.candidates_token_count or 0,
                    }

        except Exception as e:
            error_msg = str(e)
            code = self._classify_error(error_msg)
            logger.error(f"[gemini] {code.value}: {error_msg}")
            yield ChatEvent(
                type=EventType.ERROR,
                request_id=request.request_id,
                error_code=code.value,
                error_message=error_msg,
            )
            return

        # 发送 USAGE 事件
        elapsed = (time.monotonic() - start_time) * 1000
        yield ChatEvent(
            type=EventType.USAGE,
            request_id=request.request_id,
            usage=usage,
            latency_ms=round(elapsed, 1),
        )

    async def test_connection(self, model_id: str) -> dict:
        """测试 API 连接。"""
        start = time.monotonic()
        try:
            response = await self._client.aio.models.generate_content(
                model=model_id,
                contents="Hi",
                config=genai_types.GenerateContentConfig(max_output_tokens=5),
            )
            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": True,
                "message": f"Gemini ({model_id}) 连接正常",
                "latency_ms": round(elapsed, 1),
            }
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": False,
                "message": f"Gemini 连接失败: {e}",
                "latency_ms": round(elapsed, 1),
            }

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    @staticmethod
    def _build_prompt(request: ChatRequest) -> str:
        """
        将 ChatMessage 列表转为 Gemini 单字符串 prompt。

        Gemini 不原生支持 messages 数组（不同于 OpenAI），
        需要将 system prompt + conversation 组合成单一文本。
        """
        parts: list[str] = []
        system_parts: list[str] = []

        for msg in request.messages:
            if msg.role.value == "system":
                system_parts.append(msg.content)
            elif msg.role.value == "user":
                prefix = f"[{msg.name}]: " if msg.name else ""
                parts.append(f"{prefix}{msg.content}")
            elif msg.role.value == "assistant":
                prefix = f"[{msg.name}]: " if msg.name else ""
                parts.append(f"{prefix}{msg.content}")

        # 组合：system 在前，conversation 在后
        result = ""
        if system_parts:
            result += "\n\n".join(system_parts) + "\n\n"
        if parts:
            result += "\n".join(parts)

        return result

    @staticmethod
    def _classify_error(error_msg: str) -> LLMErrorCode:
        """将 Gemini 错误消息映射到统一错误码。"""
        lower = error_msg.lower()
        if "api key" in lower or "authentication" in lower or "401" in lower:
            return LLMErrorCode.AUTH
        if "quota" in lower or "rate" in lower or "429" in lower:
            return LLMErrorCode.RATE_LIMIT
        if "timeout" in lower or "deadline" in lower:
            return LLMErrorCode.TIMEOUT
        if "invalid" in lower or "400" in lower:
            return LLMErrorCode.INVALID_REQUEST
        if "unavailable" in lower or "503" in lower:
            return LLMErrorCode.PROVIDER_DOWN
        return LLMErrorCode.UNKNOWN
