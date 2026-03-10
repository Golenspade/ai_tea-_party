"""
core.prompt.assembler — Prompt 编排器

核心组件：将 CharacterCard + Persona + WorldInfo + ChatHistory
按槽位顺序组装为最终的 ChatMessage 列表。

参考 SillyTavern 的 Prompt Manager (Chat Completion 路径) 设计。
"""

from __future__ import annotations

import logging
from typing import List, Optional

from core.llm.types import ChatMessage, ChatRole
from core.prompt.slots import PromptSlot, SlotContent
from core.prompt.world_info_scanner import ScanResult, WorldInfoScanner
from models.character import Character
from models.character import Message
from models.persona import Persona
from models.world_info import WorldInfoBook

logger = logging.getLogger(__name__)

# 默认主系统提示（角色级 system_prompt_override 可替换）
# 参考 SillyTavern Main Prompt + Claude Soul 设计：
#   - 只定义行为规范，不限制长度（长度由 PHI 控制）
#   - 核心身份由 CharacterCard 槽位注入
DEFAULT_MAIN_PROMPT = """你正在参与一场多角色对话。你将扮演指定的角色，在对话中自然地回应。

- 始终保持角色的人格、语气和知识范围的一致性
- 像真人对话一样自然流畅地回应，避免机械感
- 不要重复其他角色刚说过的话或观点
- 对话中可以表达情感、提问、反驳或展开新话题
- 如果角色有独特的说话习惯或口癖，请自然地体现出来"""

# 回复长度引导（注入到 PHI 位置，紧贴生成位，权重最高）
LENGTH_GUIDANCE = {
    "short": "[回复约束] 简洁回复，1-2句话即可，像微信聊天一样精炼。",
    "default": "[回复约束] 自然回复，根据话题需要灵活调整长度，通常2-5句话。可以适当展开。",
    "long": "[回复约束] 请充分展开你的想法，包含细节描述、故事、例子或深入分析。篇幅不限，鼓励深度表达。",
}


class PromptAssembler:
    """
    Prompt 编排器。

    职责：
    1. 收集 CharacterCard + Persona + WorldInfo + ChatHistory
    2. 执行 WI 触发扫描
    3. 按槽位顺序组装最终 messages 列表
    """

    def __init__(self) -> None:
        self.scanner = WorldInfoScanner()

    def assemble(
        self,
        character: Character,
        chat_history: List[Message],
        persona: Optional[Persona] = None,
        world_info_books: Optional[List[WorldInfoBook]] = None,
        room_scenario: str = "",
        response_length: str = "default",
    ) -> List[ChatMessage]:
        """
        组装完整的 prompt messages 列表。

        Args:
            character: 当前发言角色
            chat_history: 聊天历史
            persona: 用户人设（可选）
            world_info_books: 绑定的世界观知识库列表（可选）
            room_scenario: 房间级场景设定
            response_length: 回复长度偏好 ("short" / "default" / "long")
        """
        # 1. WI 触发扫描
        scan_result = self._scan_world_info(
            character, persona, chat_history, world_info_books or []
        )

        # 2. 按槽位收集内容
        slots = self._collect_slots(
            character, persona, scan_result, room_scenario, response_length
        )

        # 3. 组装为 ChatMessage 列表
        messages = self._build_messages(
            character, slots, chat_history, scan_result
        )

        logger.debug(
            f"PromptAssembler: 组装完成，共 {len(messages)} 条 messages，"
            f"WI {scan_result.total_activated} 条激活"
        )

        return messages

    # ------------------------------------------------------------------
    # Step 1: WI 扫描
    # ------------------------------------------------------------------

    def _scan_world_info(
        self,
        character: Character,
        persona: Optional[Persona],
        chat_history: List[Message],
        books: List[WorldInfoBook],
    ) -> ScanResult:
        """构建扫描语料并执行 WI 触发扫描"""
        if not books:
            return ScanResult()

        # 构建扫描语料（参考 SillyTavern WIGlobalScanData）
        scan_parts = []

        # 角色字段
        scan_parts.append(character.personality)
        scan_parts.append(character.background)
        if character.description:
            scan_parts.append(character.description)
        if character.scenario:
            scan_parts.append(character.scenario)
        if character.creator_notes:
            scan_parts.append(character.creator_notes)

        # 用户人设
        if persona and persona.description:
            scan_parts.append(persona.description)

        # 聊天历史
        for msg in chat_history[-30:]:
            if not msg.is_system:
                scan_parts.append(msg.content)

        scan_text = "\n".join(scan_parts)
        return self.scanner.scan(books, scan_text)

    # ------------------------------------------------------------------
    # Step 2: 槽位收集
    # ------------------------------------------------------------------

    def _collect_slots(
        self,
        character: Character,
        persona: Optional[Persona],
        scan_result: ScanResult,
        room_scenario: str,
        response_length: str = "default",
    ) -> List[SlotContent]:
        """按定义顺序收集各槽位的内容"""
        slots: List[SlotContent] = []

        # MAIN_PROMPT
        main = character.system_prompt_override or DEFAULT_MAIN_PROMPT
        slots.append(SlotContent(
            slot=PromptSlot.MAIN_PROMPT,
            content=main,
            source="character_override" if character.system_prompt_override else "default",
        ))

        # WI_BEFORE_CHAR
        for ae in scan_result.before_char:
            slots.append(SlotContent(
                slot=PromptSlot.WI_BEFORE_CHAR,
                content=ae.entry.content,
                source=f"wi:{ae.book_name}",
            ))

        # CHAR_DESCRIPTION
        desc_parts = []
        desc_parts.append(f"你是{character.name}。")
        if character.description:
            desc_parts.append(f"角色描述：{character.description}")
        desc_parts.append(f"背景故事：{character.background}")
        slots.append(SlotContent(
            slot=PromptSlot.CHAR_DESCRIPTION,
            content="\n".join(desc_parts),
            source=f"character:{character.id}",
        ))

        # CHAR_PERSONALITY
        if character.personality:
            slots.append(SlotContent(
                slot=PromptSlot.CHAR_PERSONALITY,
                content=f"性格特点：{character.personality}",
                source=f"character:{character.id}",
            ))

        # SCENARIO — 角色级 > 房间级
        scenario = character.scenario or room_scenario
        if scenario:
            slots.append(SlotContent(
                slot=PromptSlot.SCENARIO,
                content=f"场景设定：{scenario}",
                source=f"character:{character.id}" if character.scenario else "room",
            ))

        # WI_AFTER_CHAR
        for ae in scan_result.after_char:
            slots.append(SlotContent(
                slot=PromptSlot.WI_AFTER_CHAR,
                content=ae.entry.content,
                source=f"wi:{ae.book_name}",
            ))

        # PERSONA
        if persona and persona.description:
            slots.append(SlotContent(
                slot=PromptSlot.PERSONA,
                content=f"用户信息：{persona.name} — {persona.description}",
                source=f"persona:{persona.id}",
            ))

        # SPEAKING STYLE
        if character.speaking_style:
            slots.append(SlotContent(
                slot=PromptSlot.CHAR_DESCRIPTION,
                content=f"说话风格：{character.speaking_style}",
                source=f"character:{character.id}",
            ))

        # POST_INSTRUCTIONS（角色级 PHI）
        phi = character.post_instructions
        if phi:
            slots.append(SlotContent(
                slot=PromptSlot.POST_INSTRUCTIONS,
                content=phi,
                source=f"character:{character.id}",
            ))

        # LENGTH_GUIDANCE（回复长度约束，PHI 位置，权重最高）
        length_text = LENGTH_GUIDANCE.get(response_length, LENGTH_GUIDANCE["default"])
        slots.append(SlotContent(
            slot=PromptSlot.POST_INSTRUCTIONS,
            content=f"{length_text}\n\n请以{character.name}的身份自然回复：",
            source="length_guidance",
        ))

        return slots

    # ------------------------------------------------------------------
    # Step 3: 组装 ChatMessage 列表
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        character: Character,
        slots: List[SlotContent],
        chat_history: List[Message],
        scan_result: ScanResult,
    ) -> List[ChatMessage]:
        """将槽位内容 + 聊天历史组装为最终的 messages 列表"""
        messages: List[ChatMessage] = []

        # --- System Top WI ---
        for ae in scan_result.system_top:
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM, content=ae.entry.content
            ))

        # --- 系统消息：合并 pre-history 槽位 ---
        system_parts = []
        for slot in slots:
            if slot.slot in (
                PromptSlot.MAIN_PROMPT,
                PromptSlot.WI_BEFORE_CHAR,
                PromptSlot.CHAR_DESCRIPTION,
                PromptSlot.CHAR_PERSONALITY,
                PromptSlot.SCENARIO,
                PromptSlot.WI_AFTER_CHAR,
                PromptSlot.PERSONA,
            ):
                system_parts.append(slot.content)

        if system_parts:
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM,
                content="\n\n".join(system_parts),
            ))

        # --- 示例对话（few-shot） ---
        for ae in scan_result.before_examples:
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM, content=ae.entry.content
            ))

        for example in character.example_dialogues:
            messages.append(ChatMessage(
                role=ChatRole.USER,
                content=f"[示例] {example.user_message}",
            ))
            messages.append(ChatMessage(
                role=ChatRole.ASSISTANT,
                content=example.character_response,
            ))

        for ae in scan_result.after_examples:
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM, content=ae.entry.content
            ))

        # --- 聊天历史 ---
        recent = chat_history[-25:] if chat_history else []

        # 收集 depth 注入点
        depth_entries = {ae.entry.depth: ae for ae in scan_result.at_depth}

        for i, msg in enumerate(recent):
            if msg.is_system:
                continue

            # AT_DEPTH 注入：depth 表示从末尾倒数第 N 条
            depth_from_end = len(recent) - i
            if depth_from_end in depth_entries:
                ae = depth_entries[depth_from_end]
                messages.append(ChatMessage(
                    role=ChatRole.SYSTEM, content=ae.entry.content
                ))

            if msg.character_id == character.id:
                messages.append(ChatMessage(
                    role=ChatRole.ASSISTANT,
                    content=msg.content,
                    name=msg.character_name,
                ))
            else:
                messages.append(ChatMessage(
                    role=ChatRole.USER,
                    content=f"[{msg.character_name}]: {msg.content}",
                    name=msg.character_name,
                ))

        # --- Post-History Instructions ---
        for slot in slots:
            if slot.slot == PromptSlot.POST_INSTRUCTIONS:
                messages.append(ChatMessage(
                    role=ChatRole.SYSTEM, content=slot.content
                ))

        # --- System Bottom WI ---
        for ae in scan_result.system_bottom:
            messages.append(ChatMessage(
                role=ChatRole.SYSTEM, content=ae.entry.content
            ))

        return messages
