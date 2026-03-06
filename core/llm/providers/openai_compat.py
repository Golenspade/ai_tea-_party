"""
core.llm.providers.openai_compat — OpenAI 兼容 Provider

支持所有 OpenAI 兼容 API，如 DeepSeek、OpenRouter、本地 Ollama 等。
只需提供不同的 base_url 和 model ID。
"""

from __future__ import annotations

import logging
import time
from typing import AsyncIterator, Any, Union

import openai

from core.llm.types import (
    ChatEvent,
    ChatRequest,
    EventType,
    LLMError,
    LLMErrorCode,
    ModelCapabilities,
)

logger = logging.getLogger(__name__)


class OpenAICompatProvider:
    """
    OpenAI 兼容 API Provider。

    适用于 DeepSeek、OpenAI、Azure OpenAI、OpenRouter、Ollama 等。

    用法：
        provider = OpenAICompatProvider(
            provider_name="deepseek",
            api_key="sk-...",
            base_url="https://api.deepseek.com",
            models={
                "deepseek-chat": ModelCapabilities(max_context_tokens=128_000),
                "deepseek-reasoner": ModelCapabilities(max_context_tokens=128_000),
            },
        )
    """

    def __init__(
        self,
        *,
        provider_name: str,
        api_key: str,
        base_url: str,
        models: dict[str, ModelCapabilities],
        default_temperature: float = 0.8,
        default_presence_penalty: float = 0.6,
        default_frequency_penalty: float = 0.3,
    ):
        self._provider_name = provider_name
        self._models = models
        self._default_temperature = default_temperature
        self._default_presence_penalty = default_presence_penalty
        self._default_frequency_penalty = default_frequency_penalty
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def supported_models(self) -> list[str]:
        return list(self._models.keys())

    def capabilities(self, model_id: str) -> ModelCapabilities:
        if model_id not in self._models:
            raise LLMError(
                code=LLMErrorCode.INVALID_REQUEST,
                message=f"Model '{model_id}' not supported by {self._provider_name}",
            )
        return self._models[model_id]

    async def generate_stream(
        self, request: ChatRequest
    ) -> AsyncIterator[ChatEvent]:
        """
        流式生成。

        将 ChatRequest 转为 OpenAI 格式，逐 chunk yield ChatEvent(DELTA)。
        出错时 yield ERROR 事件。流结束时 yield USAGE 事件（如可获取）。
        """
        openai_messages = self._build_messages(request)
        start_time = time.monotonic()
        prompt_tokens = 0
        completion_tokens = 0

        try:
            stream = await self._client.chat.completions.create(
                model=request.model_id,
                messages=openai_messages,  # type: ignore[arg-type]
                max_tokens=request.max_tokens,
                temperature=request.temperature or self._default_temperature,
                presence_penalty=self._default_presence_penalty,
                frequency_penalty=self._default_frequency_penalty,
                stream=True,
                stream_options={"include_usage": True},
            )

            async for chunk in stream:
                # 处理 usage 信息（流结束时 OpenAI 返回的最后一个 chunk）
                if chunk.usage:
                    prompt_tokens = chunk.usage.prompt_tokens
                    completion_tokens = chunk.usage.completion_tokens

                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta
                if delta and delta.content:
                    text = self._extract_text(delta.content)
                    if text:
                        yield ChatEvent(
                            type=EventType.DELTA,
                            request_id=request.request_id,
                            content=text,
                        )

        except openai.AuthenticationError as e:
            yield self._error_event(request, LLMErrorCode.AUTH, str(e))
            return
        except openai.RateLimitError as e:
            yield self._error_event(request, LLMErrorCode.RATE_LIMIT, str(e))
            return
        except openai.APITimeoutError as e:
            yield self._error_event(request, LLMErrorCode.TIMEOUT, str(e))
            return
        except openai.APIConnectionError as e:
            yield self._error_event(request, LLMErrorCode.PROVIDER_DOWN, str(e))
            return
        except openai.BadRequestError as e:
            yield self._error_event(request, LLMErrorCode.INVALID_REQUEST, str(e))
            return
        except Exception as e:
            logger.error(f"[{self._provider_name}] Unexpected error: {e}")
            yield self._error_event(request, LLMErrorCode.UNKNOWN, str(e))
            return

        # 生成结束：发送 USAGE 事件
        elapsed = (time.monotonic() - start_time) * 1000
        if prompt_tokens or completion_tokens:
            yield ChatEvent(
                type=EventType.USAGE,
                request_id=request.request_id,
                usage={
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                },
                latency_ms=round(elapsed, 1),
            )

    async def test_connection(self, model_id: str) -> dict:
        """测试 API 连接。"""
        start = time.monotonic()
        try:
            response = await self._client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": True,
                "message": f"{self._provider_name} 连接正常",
                "latency_ms": round(elapsed, 1),
            }
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": False,
                "message": f"{self._provider_name} 连接失败: {e}",
                "latency_ms": round(elapsed, 1),
            }

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    @staticmethod
    def _build_messages(request: ChatRequest) -> list[dict[str, str]]:
        """将统一的 ChatMessage 转为 OpenAI dict 格式。"""
        return [
            {"role": msg.role.value, "content": msg.content}
            for msg in request.messages
        ]

    @staticmethod
    def _extract_text(content: Union[str, list[Any]]) -> str:
        """提取流式 delta 内容中的文本（兼容 str 和复杂结构）。"""
        if isinstance(content, str):
            return content
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text", "")
                if isinstance(text, str) and text:
                    parts.append(text)
        return "".join(parts)

    @staticmethod
    def _error_event(
        request: ChatRequest, code: LLMErrorCode, message: str
    ) -> ChatEvent:
        """构造 ERROR 事件。"""
        return ChatEvent(
            type=EventType.ERROR,
            request_id=request.request_id,
            error_code=code.value,
            error_message=message,
        )
