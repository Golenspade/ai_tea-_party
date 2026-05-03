"""
tests/test_variables — 变量语义层测试
"""

import pytest

from core.llm import ChatRole
from core.prompt.assembler import (
    MAX_VARIABLE_CONTEXT_ENTRIES,
    MAX_VARIABLE_CONTEXT_TOTAL_CHARS,
    MAX_VARIABLE_CONTEXT_VALUE_CHARS,
    PromptAssembler,
)
from models.character import Character, Message
from services.variables import (
    add_variable,
    dec_variable,
    get_variable_context,
    inc_variable,
    parse_variable_expression,
    resolve_variable,
)


def test_parse_variable_expression():
    assert parse_variable_expression("simple") == ("simple", None, None)
    assert parse_variable_expression("myarr::2") == ("myarr", 2, None)
    assert parse_variable_expression("myjson::as::number") == ("myjson", None, "number")
    assert parse_variable_expression("myarr::2::as::string") == ("myarr", 2, "string")
    assert parse_variable_expression("invalid::as") == ("invalid::as", None, None)


@pytest.mark.asyncio
async def test_resolve_variable_scope_fallback_and_index_cast(test_db):
    from db import repository as repo

    room_id = "var-test-room"
    await repo.set_room_variable(room_id, "mood", "room")
    await repo.set_room_variable(room_id, "nums", [10, 20, 30])
    await repo.set_global_variable("mood", "global")
    await repo.set_global_variable("pi", "3.14")
    await repo.set_room_variable(room_id, "nested", {"a": 1})

    assert await resolve_variable("mood", room_id) == "room"
    assert await resolve_variable("mood", room_id, scope="global") == "global"
    assert await resolve_variable("nums::1", room_id) == 20
    assert await resolve_variable("nums::10", room_id, default="fallback") == "fallback"
    assert await resolve_variable("pi::as::number", room_id) == 3.14
    assert await resolve_variable("nested::as::number", room_id, default=None) == (
        "nested::as::number"
    )
    assert await resolve_variable("missing", room_id, default="fallback") == "fallback"


@pytest.mark.asyncio
async def test_get_variable_context_returns_room_and_global(test_db):
    from db import repository as repo

    room_id = "var-context-room"
    await repo.set_room_variable(room_id, "mood", "calm")
    await repo.set_global_variable("version", 1)

    context = await get_variable_context(room_id)
    assert context == {
        "room": {"mood": "calm"},
        "global": {"version": 1},
    }


@pytest.mark.asyncio
async def test_variable_ops_delegate_to_repository(test_db):
    room_id = "var-test-room-2"
    await add_variable("score", room_id, 1)
    assert await resolve_variable("score", room_id) == 1

    assert await inc_variable("score", room_id, 2) == 3
    assert await dec_variable("score", room_id, 1) == 2

    await add_variable("tags", room_id, "hello")
    assert await resolve_variable("tags", room_id) == "hello"

    assert await add_variable("tags", room_id, " world") == "hello world"
    assert await resolve_variable("tags", room_id) == "hello world"

    await add_variable("arr", room_id, "first")
    # 第一次不存在时直接写入，第二次是字符串拼接不是列表新增（符合 repository 规则）
    assert await inc_variable("arr", room_id, 1) == "first"


def test_prompt_assembler_contains_variable_context():
    character = Character(
        name="阿茶",
        personality="温和",
        background="用于单元测试",
    )
    messages = [
        Message(character_id="sys", character_name="系统", content="历史", is_system=True)
    ]

    assembler = PromptAssembler()
    built = assembler.assemble(
        character=character,
        chat_history=messages,
        variable_context={
            "room": {"mood": "calm", "count": 3},
            "global": {"site": "lobby"},
        },
        response_length="default",
    )

    variable_blocks = [
        msg.content
        for msg in built
        if msg.role == ChatRole.SYSTEM and "room.mood" in msg.content
    ]
    assert variable_blocks
    assert '[变量上下文]' in variable_blocks[0]
    assert 'room.mood = "calm"' in variable_blocks[0]
    assert "global.site = \"lobby\"" in variable_blocks[0]
    assert "room.count = 3" in variable_blocks[0]


def test_prompt_assembler_variable_context_truncates_entries():
    character = Character(
        name="阿茶",
        personality="温和",
        background="用于单元测试",
    )

    room_variables = {f"var_{i}": i for i in range(MAX_VARIABLE_CONTEXT_ENTRIES + 5)}

    assembler = PromptAssembler()
    built = assembler.assemble(
        character=character,
        chat_history=[],
        variable_context={"room": room_variables, "global": {}},
        response_length="default",
    )

    variable_blocks = [
        msg.content
        for msg in built
        if msg.role == ChatRole.SYSTEM and "room." in msg.content and "[变量上下文]" in msg.content
    ]
    assert variable_blocks
    block = variable_blocks[0]
    lines = block.splitlines()
    room_lines = [line for line in lines if line.startswith("room.")]
    assert len(room_lines) <= MAX_VARIABLE_CONTEXT_ENTRIES
    assert "...（变量上下文已截断）" in lines


def test_prompt_assembler_variable_context_value_truncates():
    character = Character(
        name="阿茶",
        personality="温和",
        background="用于单元测试",
    )

    room_variables = {
        "payload": "x" * (MAX_VARIABLE_CONTEXT_VALUE_CHARS + 50),
    }
    global_variables = {
        "greeting": "y" * (MAX_VARIABLE_CONTEXT_VALUE_CHARS + 50),
    }

    assembler = PromptAssembler()
    built = assembler.assemble(
        character=character,
        chat_history=[],
        variable_context={"room": room_variables, "global": global_variables},
        response_length="default",
    )

    variable_blocks = [
        msg.content
        for msg in built
        if msg.role == ChatRole.SYSTEM and "[变量上下文]" in msg.content
    ]
    assert variable_blocks
    block = variable_blocks[0]
    room_line = next(line for line in block.splitlines() if line.startswith("room.payload"))
    global_line = next(line for line in block.splitlines() if line.startswith("global.greeting"))
    room_value = room_line.split(" = ", 1)[1]
    global_value = global_line.split(" = ", 1)[1]
    assert room_value.endswith("...")
    assert global_value.endswith("...")
    assert len(room_value) <= MAX_VARIABLE_CONTEXT_VALUE_CHARS
    assert len(global_value) <= MAX_VARIABLE_CONTEXT_VALUE_CHARS
    assert len(block) <= MAX_VARIABLE_CONTEXT_TOTAL_CHARS + len("...（变量上下文已截断）") + 10
