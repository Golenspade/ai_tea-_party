"""
models.persona — 用户人设模型

告诉 AI「你在和谁说话」。
"""

import uuid

from pydantic import BaseModel, Field


class Persona(BaseModel):
    """用户人设 — 对应 SillyTavern 的 Persona 概念"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(default="用户", description="人设名称")
    description: str = Field(default="", description="人设描述文本，注入到 prompt 中")
    is_default: bool = Field(default=False, description="是否为默认人设")
