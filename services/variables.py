"""
services.variables — 变量语义引擎

提供变量读取/解析、room/global 解析优先级与 add/inc/dec 语义。
"""

from __future__ import annotations

import json
from typing import Any, Literal

from db import repository as repo

VariableScope = Literal["room", "global"]


def parse_variable_expression(raw: str) -> tuple[str, int | None, str | None]:
    """解析变量表达式。

    支持:
      - myvar               -> ("myvar", None, None)
      - myarr::2            -> ("myarr", 2, None)
      - myjson::as::number  -> ("myjson", None, "number")
      - myarr::2::as::string-> ("myarr", 2, "string")
    """
    if not isinstance(raw, str):
        return str(raw), None, None

    parts = [p.strip() for p in raw.split("::")]
    if not parts or not parts[0]:
        return raw, None, None

    name = parts[0]
    idx = None
    cast = None

    if len(parts) == 2:
        if parts[1].lower() == "as":
            return raw, None, None
        try:
            idx = int(parts[1])
        except ValueError:
            cast = parts[1].lower() if parts[1] else None
    elif len(parts) == 3:
        if parts[1].lower() == "as":
            cast = parts[2].lower() if parts[2] else None
        else:
            return raw, None, None
    elif len(parts) >= 4 and parts[1].lower() == "as":
        # 不合法，避免歧义
        return raw, None, None
    elif len(parts) >= 4 and parts[2].lower() == "as":
        try:
            idx = int(parts[1])
            cast = parts[3].lower() if parts[3] else None
        except ValueError:
            return raw, None, None
    else:
        return raw, None, None

    return name, idx, cast


def _extract_by_index(value: Any, index: int | None) -> Any:
    if index is None:
        return value

    if isinstance(value, (list, tuple)):
        if -len(value) <= index < len(value):
            return value[index]
        return None

    return value if index is None else None


def _cast_value(value: Any, cast_as: str | None) -> Any:
    if not cast_as:
        return value

    key = cast_as.strip().lower()
    if key in {"number", "int", "integer", "float"}:
        try:
            if isinstance(value, bool):
                return value
            if isinstance(value, int):
                return float(value) if key in {"float", "number"} else value
            if isinstance(value, float):
                return float(value)
            return float(value)
        except Exception:
            return None

    if key in {"str", "string"}:
        return str(value)

    if key in {"bool", "boolean"}:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lower = value.strip().lower()
            if lower in {"true", "1", "yes", "on"}:
                return True
            if lower in {"false", "0", "no", "off"}:
                return False
        if isinstance(value, (int, float)):
            return bool(value)
        return None

    if key in {"array", "list"}:
        return value if isinstance(value, list) else None

    if key in {"object", "json"}:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
        return None

    return value


async def resolve_variable(
    raw_name: str,
    room_id: str,
    scope: VariableScope | None = None,
    default: Any | None = None,
) -> Any:
    """解析变量表达式。

    规则：优先读取 room 变量，再读取 global 变量；都不存在返回原值（原表达式）。
    """
    base_name, index, cast = parse_variable_expression(raw_name)
    if not isinstance(base_name, str) or not base_name:
        return raw_name

    if scope == "global":
        resolved = await repo.get_global_variable(base_name)
    elif scope == "room":
        resolved = await repo.get_room_variable(room_id, base_name)
    else:
        resolved = await repo.get_room_variable(room_id, base_name)
        if resolved is None:
            resolved = await repo.get_global_variable(base_name)

    if resolved is None:
        return default if default is not None else raw_name

    indexed = _extract_by_index(resolved, index)
    if indexed is None:
        return default if default is not None else raw_name

    casted = _cast_value(indexed, cast)
    if casted is None and cast:
        return default if default is not None else raw_name

    return casted


async def add_variable(
    name: str,
    room_id: str,
    value: Any,
    scope: VariableScope = "room",
) -> Any:
    if scope == "global":
        return await repo.add_global_variable(name, value)
    return await repo.add_room_variable(room_id, name, value)


async def inc_variable(
    name: str,
    room_id: str,
    delta: Any,
    scope: VariableScope = "room",
) -> Any:
    if scope == "global":
        return await repo.inc_global_variable(name, delta)
    return await repo.inc_room_variable(room_id, name, delta)


async def dec_variable(
    name: str,
    room_id: str,
    delta: Any,
    scope: VariableScope = "room",
) -> Any:
    if scope == "global":
        return await repo.dec_global_variable(name, delta)
    return await repo.dec_room_variable(room_id, name, delta)


async def get_variable_context(room_id: str) -> dict[str, Any]:
    """返回 room + global 变量上下文（供 prompt 注入）。"""
    room_vars = await repo.list_room_variables(room_id)
    global_vars = await repo.list_global_variables()
    return {
        "room": room_vars,
        "global": global_vars,
    }

