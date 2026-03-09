"""
tests/conftest.py — 共享 fixtures
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.character import Character, ChatRoom, Message
from services.chat_service import ChatService

# ── 通用角色 / 消息 fixture ──────────────────────────────────


@pytest.fixture
def sample_character() -> Character:
    return Character(
        id="char-1",
        name="小茶",
        personality="温柔体贴",
        background="一位喜欢泡茶的茶道师",
        speaking_style="用温和的语气说话",
    )


@pytest.fixture
def sample_character_2() -> Character:
    return Character(
        id="char-2",
        name="老铁",
        personality="豪爽直率",
        background="一位北方汉子",
        speaking_style="说话粗犷豪放",
    )


@pytest.fixture
def sample_message() -> Message:
    return Message(
        id="msg-1",
        character_id="char-1",
        character_name="小茶",
        content="大家好，来喝杯茶吧！",
    )


@pytest.fixture
def sample_room(sample_character) -> ChatRoom:
    room = ChatRoom(id="room-test", name="测试茶室")
    room.add_character(sample_character)
    return room


# ── ChatService fixture (mock 掉 DB 写入和 create_task) ──────


def _noop_create_task(coro):
    """替代 asyncio.create_task，直接关闭 coroutine 避免警告"""
    coro.close()
    return MagicMock()


@pytest.fixture
def chat_service():
    """返回一个干净的 ChatService，mock 掉所有 db 操作和 asyncio.create_task"""
    with (
        patch("services.chat_service.db") as mock_db,
        patch("services.chat_service.asyncio.create_task", side_effect=_noop_create_task),
    ):
        mock_db.save_room = AsyncMock()
        mock_db.save_character = AsyncMock()
        mock_db.save_message = AsyncMock()
        mock_db.remove_character_from_room = AsyncMock()
        mock_db.clear_messages = AsyncMock()
        svc = ChatService()
        yield svc


@pytest.fixture
def mock_orchestrator():
    """模拟 ChatOrchestrator，不需要 API key"""
    orch = MagicMock()
    orch.is_configured.return_value = True
    orch.generate_non_stream = AsyncMock(return_value="这是一个 AI 回复")
    orch.get_current_config.return_value = {
        "provider": "mock",
        "model": "mock-model",
    }
    orch.test_connection = AsyncMock(return_value={"status": "ok"})
    return orch


# ── DB 测试用 fixture ────────────────────────────────────────


@pytest.fixture
async def test_db(tmp_path):
    """使用临时目录初始化测试数据库，patch 掉全局 DB_PATH"""
    db_path = tmp_path / "test.db"

    with (
        patch("db.database.DB_PATH", db_path),
        patch("db.repository.DB_PATH", db_path),
    ):
        from db.database import init_db
        await init_db()
        yield db_path
