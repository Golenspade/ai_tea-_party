"""
tests/test_db.py — SQLite 持久化单元测试
"""

from unittest.mock import patch

import pytest

from models.character import Character, ChatRoom, Message


@pytest.fixture
def test_room():
    room = ChatRoom(id="db-test-room", name="DB 测试茶室", description="用于测试的聊天室")
    return room


@pytest.fixture
def test_character():
    return Character(
        id="db-test-char",
        name="DB小茶",
        personality="安静",
        background="虚拟角色",
    )


class TestDatabaseInit:
    @pytest.mark.asyncio
    async def test_init_db(self, test_db):
        """数据库初始化不报错"""
        assert test_db.exists()

    @pytest.mark.asyncio
    async def test_double_init(self, test_db):
        """双次初始化不报错 (CREATE IF NOT EXISTS)"""
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db.database import init_db
            await init_db()


class TestRoomPersistence:
    @pytest.mark.asyncio
    async def test_save_and_load_room(self, test_db, test_room):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            await db_repo.save_room(test_room)
            rooms = await db_repo.load_all_rooms()
            assert len(rooms) >= 1
            found = next((r for r in rooms if r["id"] == test_room.id), None)
            assert found is not None
            assert found["name"] == "DB 测试茶室"

    @pytest.mark.asyncio
    async def test_room_exists(self, test_db, test_room):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            await db_repo.save_room(test_room)
            exists = await db_repo.room_exists_in_db(test_room.id)
            assert exists is True

    @pytest.mark.asyncio
    async def test_room_not_exists(self, test_db):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            exists = await db_repo.room_exists_in_db("nonexistent-room")
            assert exists is False


class TestCharacterPersistence:
    @pytest.mark.asyncio
    async def test_save_and_load_character(self, test_db, test_room, test_character):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            await db_repo.save_room(test_room)
            await db_repo.save_character(test_character, test_room.id)
            rooms = await db_repo.load_all_rooms()
            found_room = next((r for r in rooms if r["id"] == test_room.id), None)
            assert found_room is not None
            assert len(found_room["characters"]) == 1
            assert found_room["characters"][0].name == "DB小茶"

    @pytest.mark.asyncio
    async def test_remove_character(self, test_db, test_room, test_character):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            await db_repo.save_room(test_room)
            await db_repo.save_character(test_character, test_room.id)
            await db_repo.remove_character_from_room(test_room.id, test_character.id)
            rooms = await db_repo.load_all_rooms()
            found_room = next((r for r in rooms if r["id"] == test_room.id), None)
            assert found_room is not None
            assert len(found_room["characters"]) == 0


class TestMessagePersistence:
    @pytest.mark.asyncio
    async def test_save_message(self, test_db, test_room):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            await db_repo.save_room(test_room)
            msg = Message(
                id="db-test-msg",
                character_id="char-1",
                character_name="小茶",
                content="测试消息持久化",
            )
            await db_repo.save_message(msg, test_room.id)
            rooms = await db_repo.load_all_rooms()
            found_room = next((r for r in rooms if r["id"] == test_room.id), None)
            assert found_room is not None
            assert len(found_room["messages"]) == 1
            assert found_room["messages"][0].content == "测试消息持久化"

    @pytest.mark.asyncio
    async def test_clear_messages(self, test_db, test_room):
        with (
            patch("db.database.DB_PATH", test_db),
            patch("db.repository.DB_PATH", test_db),
        ):
            from db import repository as db_repo
            await db_repo.save_room(test_room)
            msg = Message(
                character_id="char-1", character_name="小茶", content="即将被清空"
            )
            await db_repo.save_message(msg, test_room.id)
            await db_repo.clear_messages(test_room.id)
            rooms = await db_repo.load_all_rooms()
            found_room = next((r for r in rooms if r["id"] == test_room.id), None)
            assert found_room is not None
            assert len(found_room["messages"]) == 0
