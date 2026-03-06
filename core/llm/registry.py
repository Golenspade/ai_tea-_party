"""
core.llm.registry — Provider 注册表

统一管理所有已注册 Provider，提供按 model_id 查找的能力。
替代原有 main.py 中的 provider_map dict。
"""

from __future__ import annotations

import logging
from typing import Optional

from core.llm.provider import LLMProvider
from core.llm.types import LLMError, LLMErrorCode, ModelCapabilities

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """
    Provider 注册表。

    用法：
        registry = ProviderRegistry()
        registry.register(OpenAICompatProvider(...))
        registry.register(GeminiProvider(...))

        provider = registry.get_provider("deepseek-chat")
        async for event in provider.generate_stream(request):
            ...
    """

    def __init__(self) -> None:
        self._model_to_provider: dict[str, LLMProvider] = {}
        self._providers: list[LLMProvider] = []

    def register(self, provider: LLMProvider) -> None:
        """注册一个 Provider，将其支持的所有 model_id 映射到自身。"""
        models = provider.supported_models()
        self._providers.append(provider)
        for model_id in models:
            if model_id in self._model_to_provider:
                existing = self._model_to_provider[model_id].provider_name
                logger.warning(
                    f"model '{model_id}' 已被 '{existing}' 注册，"
                    f"将被 '{provider.provider_name}' 覆盖"
                )
            self._model_to_provider[model_id] = provider
            logger.info(
                f"注册模型: {model_id} → {provider.provider_name}"
            )

    def get_provider(self, model_id: str) -> LLMProvider:
        """根据 model_id 获取对应 Provider，找不到则抛出 LLMError。"""
        provider = self._model_to_provider.get(model_id)
        if provider is None:
            available = ", ".join(sorted(self._model_to_provider.keys()))
            raise LLMError(
                code=LLMErrorCode.INVALID_REQUEST,
                message=f"未知模型: {model_id}。可用模型: {available}",
            )
        return provider

    def get_capabilities(self, model_id: str) -> ModelCapabilities:
        """获取模型能力。"""
        return self.get_provider(model_id).capabilities(model_id)

    def list_models(self) -> list[dict]:
        """
        列出所有已注册模型。

        Returns:
            [{"model_id": str, "provider": str, "capabilities": ModelCapabilities}, ...]
        """
        result = []
        for model_id, provider in sorted(self._model_to_provider.items()):
            result.append(
                {
                    "model_id": model_id,
                    "provider": provider.provider_name,
                    "capabilities": provider.capabilities(model_id).model_dump(),
                }
            )
        return result

    def has_model(self, model_id: str) -> bool:
        """检查某个 model_id 是否已注册。"""
        return model_id in self._model_to_provider

    @property
    def registered_providers(self) -> list[str]:
        """返回所有已注册 Provider 的名称列表。"""
        return [p.provider_name for p in self._providers]

    def find_provider(self, provider_name: str) -> Optional[LLMProvider]:
        """按 provider_name 查找 Provider 实例。"""
        for p in self._providers:
            if p.provider_name == provider_name:
                return p
        return None
