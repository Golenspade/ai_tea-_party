"""
core.llm.providers.litellm_provider — LiteLLM 统一 Provider

使用 LiteLLM SDK 统一调用所有 LLM（OpenAI、DeepSeek、Gemini 等），
替代原有的 OpenAICompatProvider 和 GeminiProvider。
"""

from __future__ import annotations

import logging
import time
from typing import AsyncIterator, Optional

import litellm

from core.llm.types import (
    ChatEvent,
    ChatRequest,
    EventType,
    LLMError,
    LLMErrorCode,
    ModelCapabilities,
)

logger = logging.getLogger(__name__)

# 降低 litellm 自身的日志噪音
litellm.suppress_debug_info = True
logging.getLogger("LiteLLM").setLevel(logging.WARNING)


class LiteLLMProvider:
    """
    基于 LiteLLM 的统一 Provider。

    用法：
        provider = LiteLLMProvider(
            models={
                "deepseek-chat": ModelConfig(
                    litellm_model="deepseek/deepseek-chat",
                    api_key="sk-...",
                    capabilities=ModelCapabilities(...),
                ),
                "gemini-2.5-flash": ModelConfig(
                    litellm_model="gemini/gemini-2.5-flash",
                    api_key="AIza...",
                    capabilities=ModelCapabilities(...),
                ),
            },
        )
    """

    def __init__(
        self,
        *,
        models: dict[str, ModelConfig],
        default_temperature: float = 0.85,
        default_presence_penalty: float = 0.6,
        default_frequency_penalty: float = 0.3,
    ):
        self._models = models
        self._default_temperature = default_temperature
        self._default_presence_penalty = default_presence_penalty
        self._default_frequency_penalty = default_frequency_penalty

    @property
    def provider_name(self) -> str:
        return "litellm"

    def supported_models(self) -> list[str]:
        return list(self._models.keys())

    def capabilities(self, model_id: str) -> ModelCapabilities:
        cfg = self._models.get(model_id)
        if cfg is None:
            raise LLMError(
                code=LLMErrorCode.INVALID_REQUEST,
                message=f"Model '{model_id}' not registered in LiteLLMProvider",
            )
        return cfg.capabilities

    async def generate_stream(
        self, request: ChatRequest
    ) -> AsyncIterator[ChatEvent]:
        """
        流式生成。

        通过 litellm.acompletion 统一调用，LiteLLM 内部负责
        将 OpenAI 格式消息转换为各厂商原生格式。
        """
        cfg = self._models.get(request.model_id)
        if cfg is None:
            yield ChatEvent(
                type=EventType.ERROR,
                request_id=request.request_id,
                error_code=LLMErrorCode.INVALID_REQUEST.value,
                error_message=f"Unknown model: {request.model_id}",
            )
            return

        messages = self._build_messages(request)
        start_time = time.monotonic()
        prompt_tokens = 0
        completion_tokens = 0

        # 构建 litellm 调用参数
        kwargs: dict = {
            "model": cfg.litellm_model,
            "messages": messages,
            "temperature": request.temperature or self._default_temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
            "api_key": cfg.api_key,
        }

        if cfg.api_base:
            kwargs["api_base"] = cfg.api_base

        if request.max_tokens:
            kwargs["max_tokens"] = request.max_tokens

        # 对非 Gemini 模型添加 penalty 参数
        if not cfg.litellm_model.startswith("gemini/"):
            kwargs["presence_penalty"] = self._default_presence_penalty
            kwargs["frequency_penalty"] = self._default_frequency_penalty

        try:
            response = await litellm.acompletion(**kwargs)

            async for chunk in response:
                # 提取 usage 信息
                if hasattr(chunk, "usage") and chunk.usage:
                    prompt_tokens = getattr(chunk.usage, "prompt_tokens", 0) or 0
                    completion_tokens = getattr(chunk.usage, "completion_tokens", 0) or 0

                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta
                # 只输出 content，不输出 reasoning_content（内部思维链）
                if delta and delta.content:
                    yield ChatEvent(
                        type=EventType.DELTA,
                        request_id=request.request_id,
                        content=delta.content,
                    )

        except litellm.AuthenticationError as e:
            yield self._error_event(request, LLMErrorCode.AUTH, str(e))
            return
        except litellm.RateLimitError as e:
            yield self._error_event(request, LLMErrorCode.RATE_LIMIT, str(e))
            return
        except litellm.Timeout as e:
            yield self._error_event(request, LLMErrorCode.TIMEOUT, str(e))
            return
        except litellm.APIConnectionError as e:
            yield self._error_event(request, LLMErrorCode.PROVIDER_DOWN, str(e))
            return
        except litellm.BadRequestError as e:
            yield self._error_event(request, LLMErrorCode.INVALID_REQUEST, str(e))
            return
        except Exception as e:
            logger.error(f"[litellm] Unexpected error: {e}")
            yield self._error_event(request, LLMErrorCode.UNKNOWN, str(e))
            return

        # 发送 USAGE 事件
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
        cfg = self._models.get(model_id)
        if cfg is None:
            return {"success": False, "message": f"未知模型: {model_id}"}

        start = time.monotonic()
        try:
            kwargs: dict = {
                "model": cfg.litellm_model,
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 5,
                "api_key": cfg.api_key,
            }
            if cfg.api_base:
                kwargs["api_base"] = cfg.api_base

            await litellm.acompletion(**kwargs)
            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": True,
                "message": f"{model_id} 连接正常",
                "latency_ms": round(elapsed, 1),
            }
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": False,
                "message": f"{model_id} 连接失败: {e}",
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


class ModelConfig:
    """单个模型的配置。"""

    def __init__(
        self,
        *,
        litellm_model: str,
        api_key: str,
        capabilities: ModelCapabilities,
        api_base: Optional[str] = None,
    ):
        self.litellm_model = litellm_model
        self.api_key = api_key
        self.capabilities = capabilities
        self.api_base = api_base
