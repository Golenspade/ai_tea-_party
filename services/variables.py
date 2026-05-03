"""
services.variables — 变量语义引擎

提供变量读取/解析、room/global 解析优先级与 add/inc/dec 语义。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shlex
from dataclasses import dataclass
from typing import Any, Literal

from db import repository as repo

VariableScope = Literal["room", "global"]
logger = logging.getLogger(__name__)


_VAR_MACRO_RE = re.compile(r"{{\s*([^{}]+)\s*}}")


def parse_variable_value(raw: str) -> Any:
    """将文本值解析为 JSON/数字/布尔，失败则原样返回字符串。"""
    if raw is None:
        return ""

    value = raw.strip()
    if not value:
        return ""

    if (value.startswith("\"") and value.endswith("\"")) or (
        value.startswith("'") and value.endswith("'")
    ):
        return value[1:-1]

    if value.lower() in {"true", "yes", "on", "1"}:
        return True
    if value.lower() in {"false", "off", "no", "0"}:
        return False
    if value.lower() in {"null", "none", "nil"}:
        return None

    try:
        if "." in value:
            return float(value)
        return int(value)
    except Exception:
        pass

    try:
        return json.loads(value)
    except Exception:
        return raw


def _format_variable_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _split_command_args(arg_text: str) -> list[str]:
    if not arg_text:
        return []
    try:
        return shlex.split(arg_text)
    except Exception:
        return [a for a in arg_text.split() if a]


def _extract_name_and_value(
    args: list[str],
    *,
    default: str = "",
) -> tuple[str, str]:
    if not args:
        return "", default

    first = args[0].strip()
    rest = " ".join(args[1:]).strip() if len(args) > 1 else ""

    if first.startswith("key="):
        name = first[len("key="):].strip()
        value = rest
        if value.startswith("value="):
            value = value[len("value="):].strip()
        return name, value

    if first.startswith("name="):
        name = first[len("name="):].strip()
        return name, rest

    if not rest and "=" in first and first.split("=", 1)[0] in {"key", "name"}:
        k, v = first.split("=", 1)
        if k == "key":
            return v.strip(), ""
        if k == "name":
            return v.strip(), ""

    return first, rest


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
    elif len(parts) == 4 and parts[1].lower() == "as":
        # 不合法，避免歧义
        return raw, None, None
    elif len(parts) == 4 and parts[2].lower() == "as":
        try:
            idx = int(parts[1])
            cast = parts[3].lower() if parts[3] else None
        except ValueError:
            return raw, None, None
    else:
        return raw, None, None

    return name, idx, cast


def _parse_command(content: str) -> tuple[str | None, list[str]]:
    text = content.strip()
    if not text.startswith("/"):
        return None, []

    command_line = text[1:].strip()
    if not command_line:
        return None, []

    if " " not in command_line:
        return command_line.lower(), []

    op, arg_text = command_line.split(" ", 1)
    return op.strip().lower(), _split_command_args(arg_text)


@dataclass
class VariableCommandResult:
    handled: bool
    output: str = ""


async def execute_variable_command(content: str, room_id: str) -> VariableCommandResult:
    """执行一条以 / 开头的变量命令。"""
    op, args = _parse_command(content)
    if not op:
        return VariableCommandResult(False, "")

    op_map = {
        "getvar": ("get", "room"),
        "setvar": ("set", "room"),
        "addvar": ("add", "room"),
        "incvar": ("inc", "room"),
        "decvar": ("dec", "room"),
        "listvar": ("list", "room"),
        "flushvar": ("flush", "room"),
        "getglobalvar": ("get", "global"),
        "setglobalvar": ("set", "global"),
        "addglobalvar": ("add", "global"),
        "incglobalvar": ("inc", "global"),
        "decglobalvar": ("dec", "global"),
        "listglobalvar": ("list", "global"),
        "flushglobalvar": ("flush", "global"),
    }

    mapping = op_map.get(op)
    if not mapping:
        return VariableCommandResult(False, "")

    action, scope = mapping
    scope_literal = "global" if scope == "global" else "room"

    # listvar: /listvar [room|global]
    if action == "list":
        if args:
            scope_arg = (args[0] or "").lower()
            if scope_arg in {"global", "g", "globalvar"}:
                scope_literal = "global"
            elif scope_arg in {"room", "r", "local", "var"}:
                scope_literal = "room"

        if scope_literal == "global":
            values = await repo.list_global_variables()
            return VariableCommandResult(True, json.dumps(values, ensure_ascii=False))

        values = await repo.list_room_variables(room_id)
        return VariableCommandResult(True, json.dumps(values, ensure_ascii=False))

    # flushvar / flushglobalvar: /flushvar name
    if action == "flush":
        name = (args[0] if args else "").strip()
        if not name:
            return VariableCommandResult(True, "变量名不能为空")

        if scope_literal == "global":
            await repo.delete_global_variable(name)
            return VariableCommandResult(True, f"已清空全局变量: {name}")

        await repo.delete_room_variable(room_id, name)
        return VariableCommandResult(True, f"已清空变量: {name}")

    # get/set/add/inc/dec
    name, raw_value = _extract_name_and_value(args, default="")
    if not name:
        return VariableCommandResult(True, "变量名不能为空")

    variable_scope: VariableScope = scope_literal

    if action == "get":
        value = await resolve_variable(name, room_id, scope=variable_scope, default="")
        return VariableCommandResult(True, _format_variable_output(value))

    if action == "set":
        value = parse_variable_value(raw_value)
        if variable_scope == "global":
            await repo.set_global_variable(name, value)
            return VariableCommandResult(True, f"已设置全局变量 {name}")
        await repo.set_room_variable(room_id, name, value)
        return VariableCommandResult(True, f"已设置变量 {name}")

    if action == "add":
        value = parse_variable_value(raw_value)
        new_value = await add_variable(name, room_id, value, scope=variable_scope)
        return VariableCommandResult(
            True,
            f"变量 {name} 已更新为 { _format_variable_output(new_value) }",
        )

    if action in {"inc", "dec"}:
        delta = parse_variable_value(raw_value)
        if raw_value.strip() == "":
            delta = 1

        if not isinstance(delta, (int, float)) or isinstance(delta, bool):
            return VariableCommandResult(True, "增量必须是数字")

        if action == "inc":
            new_value = await inc_variable(name, room_id, delta, scope=variable_scope)
        else:
            new_value = await dec_variable(name, room_id, delta, scope=variable_scope)
        return VariableCommandResult(
            True,
            f"变量 {name} 已更新为 { _format_variable_output(new_value) }",
        )

    return VariableCommandResult(True, "")


async def render_variable_macros(content: str, room_id: str) -> str:
    """在文本中替换 {{...}} 变量表达式。"""
    if "{{" not in content:
        return content

    result: list[str] = []
    last = 0

    for match in _VAR_MACRO_RE.finditer(content):
        result.append(content[last : match.start()])
        expr = match.group(1).strip()

        parts = [part.strip() for part in expr.split("::")]
        if not parts:
            result.append("")
            last = match.end()
            continue

        command = parts[0].lower()

        if command in {"getvar", "getglobalvar"}:
            name_expr = "::".join(parts[1:])
            scope = "global" if command == "getglobalvar" else "room"
            value = await resolve_variable(name_expr, room_id, scope=scope, default="")
            result.append(_format_variable_output(value))
            last = match.end()
            continue

        if command in {
            "setvar",
            "setglobalvar",
            "addvar",
            "addglobalvar",
            "incvar",
            "incglobalvar",
            "decvar",
            "decglobalvar",
        }:
            scope = (
                "global"
                if command in {"setglobalvar", "addglobalvar", "incglobalvar", "decglobalvar"}
                else "room"
            )
            name = parts[1] if len(parts) > 1 else ""
            if not name:
                result.append(f"{{{{{expr}}}}}")
                last = match.end()
                continue

            value_expr = "::".join(parts[2:]) if len(parts) > 2 else ""

            if command in {"setvar", "setglobalvar"}:
                value = parse_variable_value(value_expr)
                if scope == "global":
                    await repo.set_global_variable(name, value)
                else:
                    await repo.set_room_variable(room_id, name, value)
                result.append("")
                last = match.end()
                continue

            if command in {"addvar", "addglobalvar"}:
                value = parse_variable_value(value_expr)
                await add_variable(name, room_id, value, scope=scope)
                result.append("")
                last = match.end()
                continue

            delta = parse_variable_value(value_expr)
            if value_expr.strip() == "":
                delta = 1

            if not isinstance(delta, (int, float)) or isinstance(delta, bool):
                result.append(f"{{{{{expr}}}}}")
                last = match.end()
                continue

            if command in {"incvar", "incglobalvar"}:
                new_value = await inc_variable(name, room_id, delta, scope=scope)
            else:
                new_value = await dec_variable(name, room_id, delta, scope=scope)

            result.append(_format_variable_output(new_value))
            last = match.end()
            continue

        if command in {"flushvar", "flushglobalvar"}:
            name = parts[1] if len(parts) > 1 else ""
            if name:
                if command == "flushglobalvar":
                    await repo.delete_global_variable(name)
                else:
                    await repo.delete_room_variable(room_id, name)
            result.append("")
            last = match.end()
            continue

        # 未识别表达式：保留原样，避免静默吞掉用户输入
        result.append(f"{{{{{expr}}}}}")
        last = match.end()

    result.append(content[last:])
    return "".join(result)


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
        if not await repo.global_variable_exists(base_name):
            return default if default is not None else raw_name
        resolved = await repo.get_global_variable(base_name)
    elif scope == "room":
        if not await repo.room_variable_exists(room_id, base_name):
            return default if default is not None else raw_name
        resolved = await repo.get_room_variable(room_id, base_name)
    else:
        if await repo.room_variable_exists(room_id, base_name):
            resolved = await repo.get_room_variable(room_id, base_name)
        elif await repo.global_variable_exists(base_name):
            resolved = await repo.get_global_variable(base_name)
        else:
            return default if default is not None else raw_name

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
    room_vars, global_vars = await asyncio.gather(
        repo.list_room_variables(room_id),
        repo.list_global_variables(),
        return_exceptions=True,
    )

    if isinstance(room_vars, Exception):
        logger.warning("获取房间变量上下文失败: %s", room_vars)
        room_vars = {}
    if isinstance(global_vars, Exception):
        logger.warning("获取全局变量上下文失败: %s", global_vars)
        global_vars = {}

    # 安全防御：确保异常类型不会污染下游类型推断
    if not isinstance(room_vars, dict):
        room_vars = {}
    if not isinstance(global_vars, dict):
        global_vars = {}

    return {
        "room": room_vars,
        "global": global_vars,
    }
