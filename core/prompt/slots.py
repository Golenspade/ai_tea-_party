"""
core.prompt.slots — Prompt 组装槽位定义

每个槽位代表最终 prompt 中的一个位置。
Assembler 按槽位顺序将各种源数据填入。
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class PromptSlot(str, Enum):
    """Prompt 组装槽位 — 定义注入顺序（从上到下即为 prompt 中的前后顺序）"""

    MAIN_PROMPT = "main_prompt"
    WI_BEFORE_CHAR = "wi_before_char"
    CHAR_DESCRIPTION = "char_description"
    CHAR_PERSONALITY = "char_personality"
    SCENARIO = "scenario"
    WI_AFTER_CHAR = "wi_after_char"
    PERSONA = "persona"
    EXAMPLE_DIALOGUES = "examples"
    CHAT_HISTORY = "chat_history"
    WI_DEPTH = "wi_depth"
    POST_INSTRUCTIONS = "post_instructions"


class SlotContent(BaseModel):
    """一个已填充的槽位"""

    slot: PromptSlot
    content: str
    source: Optional[str] = None  # 来源标识，如 "character:xxx" / "wi:xxx"
