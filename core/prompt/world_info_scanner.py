"""
core.prompt.world_info_scanner — World Info 触发扫描器

扫描聊天历史 + 角色/用户设定，激活匹配关键词的 WI 条目，
并按注入位置分流。参考 SillyTavern 的 WIGlobalScanData 机制。
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import List

from models.world_info import WIPosition, WorldInfoBook, WorldInfoEntry

logger = logging.getLogger(__name__)


@dataclass
class ActivatedEntry:
    """一个被激活的 WI 条目"""

    entry: WorldInfoEntry
    book_name: str


@dataclass
class ScanResult:
    """扫描结果 — 按注入位置分组"""

    before_char: List[ActivatedEntry] = field(default_factory=list)
    after_char: List[ActivatedEntry] = field(default_factory=list)
    before_examples: List[ActivatedEntry] = field(default_factory=list)
    after_examples: List[ActivatedEntry] = field(default_factory=list)
    at_depth: List[ActivatedEntry] = field(default_factory=list)
    system_top: List[ActivatedEntry] = field(default_factory=list)
    system_bottom: List[ActivatedEntry] = field(default_factory=list)

    def get_by_position(self, position: WIPosition) -> List[ActivatedEntry]:
        """按位置获取已激活条目"""
        mapping = {
            WIPosition.BEFORE_CHAR: self.before_char,
            WIPosition.AFTER_CHAR: self.after_char,
            WIPosition.BEFORE_EXAMPLES: self.before_examples,
            WIPosition.AFTER_EXAMPLES: self.after_examples,
            WIPosition.AT_DEPTH: self.at_depth,
            WIPosition.SYSTEM_TOP: self.system_top,
            WIPosition.SYSTEM_BOTTOM: self.system_bottom,
        }
        return mapping.get(position, [])

    @property
    def total_activated(self) -> int:
        return sum(
            len(lst)
            for lst in [
                self.before_char,
                self.after_char,
                self.before_examples,
                self.after_examples,
                self.at_depth,
                self.system_top,
                self.system_bottom,
            ]
        )


class WorldInfoScanner:
    """
    WI 触发扫描器。

    扫描源（参考 SillyTavern 的 WIGlobalScanData）：
    - 聊天历史全文
    - character.description / personality / scenario
    - persona.description
    - creator_notes
    """

    def scan(
        self,
        books: List[WorldInfoBook],
        scan_text: str,
    ) -> ScanResult:
        """
        扫描给定文本，激活匹配的 WI 条目并按位置分组。

        Args:
            books: 要扫描的知识库列表
            scan_text: 拼接后的扫描语料
        """
        result = ScanResult()
        scan_lower = scan_text.lower()

        for book in books:
            if not book.enabled:
                continue
            for entry in book.entries:
                if not entry.enabled:
                    continue
                if entry.constant or self._matches(entry, scan_lower):
                    activated = ActivatedEntry(
                        entry=entry, book_name=book.name
                    )
                    self._route(activated, result)

        # 每个分组内部按 order 排序
        for group in [
            result.before_char,
            result.after_char,
            result.before_examples,
            result.after_examples,
            result.at_depth,
            result.system_top,
            result.system_bottom,
        ]:
            group.sort(key=lambda a: a.entry.order)

        if result.total_activated > 0:
            logger.info(
                f"World Info 扫描完成: {result.total_activated} 条目被激活"
            )

        return result

    def _matches(self, entry: WorldInfoEntry, scan_text: str) -> bool:
        """检查条目是否被触发"""
        # 主关键词：任一匹配即触发
        primary_hit = any(
            self._keyword_in_text(key, scan_text) for key in entry.keys
        )
        if not primary_hit:
            return False

        # 如果没有二级关键词，主关键词匹配即可
        if not entry.secondary_keys:
            return True

        # 二级关键词逻辑
        if entry.selective_logic == "AND":
            return any(
                self._keyword_in_text(key, scan_text)
                for key in entry.secondary_keys
            )
        elif entry.selective_logic == "NOT":
            return not any(
                self._keyword_in_text(key, scan_text)
                for key in entry.secondary_keys
            )

        return True

    def _keyword_in_text(self, keyword: str, text: str) -> bool:
        """关键词匹配（大小写不敏感，支持中文）"""
        keyword_lower = keyword.lower().strip()
        if not keyword_lower:
            return False
        # 用 re.escape 安全匹配特殊字符
        return bool(re.search(re.escape(keyword_lower), text))

    def _route(self, activated: ActivatedEntry, result: ScanResult) -> None:
        """按配置的注入位置分流到对应的分组"""
        position = activated.entry.position
        if position == WIPosition.BEFORE_CHAR:
            result.before_char.append(activated)
        elif position == WIPosition.AFTER_CHAR:
            result.after_char.append(activated)
        elif position == WIPosition.BEFORE_EXAMPLES:
            result.before_examples.append(activated)
        elif position == WIPosition.AFTER_EXAMPLES:
            result.after_examples.append(activated)
        elif position == WIPosition.AT_DEPTH:
            result.at_depth.append(activated)
        elif position == WIPosition.SYSTEM_TOP:
            result.system_top.append(activated)
        elif position == WIPosition.SYSTEM_BOTTOM:
            result.system_bottom.append(activated)
