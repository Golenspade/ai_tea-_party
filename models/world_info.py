"""
models.world_info — 世界观 / 知识库模型

参考 SillyTavern 的 World Info / Lorebook 系统。
条件触发的动态知识注入，支持多位置路由。
"""

from __future__ import annotations

import uuid
from enum import Enum
from typing import List

from pydantic import BaseModel, Field


class WIPosition(str, Enum):
    """世界观条目的注入位置"""

    BEFORE_CHAR = "before_char"          # 角色定义之前
    AFTER_CHAR = "after_char"            # 角色定义之后
    BEFORE_EXAMPLES = "before_examples"  # 示例对话之前
    AFTER_EXAMPLES = "after_examples"    # 示例对话之后
    AT_DEPTH = "at_depth"                # 在聊天历史的第 N 条处注入
    SYSTEM_TOP = "system_top"            # 系统消息最前面
    SYSTEM_BOTTOM = "system_bottom"      # 系统消息最后面


class WorldInfoEntry(BaseModel):
    """单条世界观条目"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # 触发条件
    keys: List[str] = Field(..., description="主关键词列表，任一匹配即触发")
    secondary_keys: List[str] = Field(default_factory=list, description="二级关键词")
    selective_logic: str = Field(
        default="AND", description="二级关键词逻辑：AND / NOT"
    )

    # 内容
    content: str = Field(..., description="注入的文本内容")

    # 注入控制
    position: WIPosition = Field(
        default=WIPosition.AFTER_CHAR, description="注入位置"
    )
    depth: int = Field(
        default=4, description="当 position=AT_DEPTH 时，在聊天历史第 N 条处注入"
    )
    enabled: bool = Field(default=True, description="是否启用")
    constant: bool = Field(
        default=False, description="True = 总是注入，无需关键词触发"
    )

    # 排序
    order: int = Field(
        default=100, description="同位置多条目的排序权重（小的在前）"
    )


class WorldInfoBook(BaseModel):
    """世界观知识库 — 一组 WI 条目的集合"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="知识库名称，如 '三国演义' / '赛博朋克'")
    description: str = Field(default="", description="知识库描述")
    enabled: bool = Field(default=True, description="是否启用")
    entries: List[WorldInfoEntry] = Field(
        default_factory=list, description="条目列表"
    )
