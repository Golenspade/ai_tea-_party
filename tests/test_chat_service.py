"""
tests/test_chat_service.py — ChatService 单元测试
"""


import pytest

from core.llm import ChatRole
from core.llm import ProviderRegistry
from services.orchestrator import ChatOrchestrator


@pytest.fixture
def svc_with_room(chat_service, sample_character, mock_orchestrator):
    """带有默认房间和角色的 ChatService"""
    chat_service.set_orchestrator(mock_orchestrator)
    room = chat_service.create_chat_room("测试茶室")
    chat_service.add_character_to_room(room.id, sample_character)
    return chat_service, room


class TestChatRoomManagement:
    def test_create_chat_room(self, chat_service):
        room = chat_service.create_chat_room("新茶室", description="一个新房间")
        assert room.name == "新茶室"
        assert room.id in chat_service.chat_rooms

    def test_get_chat_room(self, chat_service):
        room = chat_service.create_chat_room("测试茶室")
        found = chat_service.get_chat_room(room.id)
        assert found is not None
        assert found.name == "测试茶室"

    def test_get_nonexistent_room(self, chat_service):
        assert chat_service.get_chat_room("nonexistent") is None

    def test_get_all_rooms(self, chat_service):
        chat_service.create_chat_room("茶室A")
        chat_service.create_chat_room("茶室B")
        rooms = chat_service.get_all_chat_rooms()
        assert len(rooms) == 2

    def test_start_auto_chat_nonexistent_room(self, chat_service):
        assert chat_service.start_auto_chat("no-room") is False

    def test_stop_auto_chat_nonexistent_room(self, chat_service):
        assert chat_service.stop_auto_chat("no-room") is False


class TestCharacterManagement:
    def test_add_character(self, chat_service, sample_character):
        room = chat_service.create_chat_room("测试茶室")
        result = chat_service.add_character_to_room(room.id, sample_character)
        assert result is True
        assert len(room.characters) == 1

    def test_add_character_nonexistent_room(self, chat_service, sample_character):
        result = chat_service.add_character_to_room("no-room", sample_character)
        assert result is False

    def test_remove_character(self, chat_service, sample_character):
        room = chat_service.create_chat_room("测试茶室")
        chat_service.add_character_to_room(room.id, sample_character)
        result = chat_service.remove_character_from_room(room.id, sample_character.id)
        assert result is True
        assert len(room.characters) == 0

    def test_remove_nonexistent_character(self, chat_service, sample_character):
        room = chat_service.create_chat_room("测试茶室")
        result = chat_service.remove_character_from_room(room.id, "no-char")
        assert result is False


class TestMessageHandling:
    @pytest.mark.asyncio
    async def test_send_message(self, svc_with_room, sample_character):
        svc, room = svc_with_room
        result = await svc.send_message(room.id, sample_character.id, "你好！")
        assert result is True
        assert any(m.content == "你好！" for m in room.messages)

    @pytest.mark.asyncio
    async def test_send_message_nonexistent_room(self, chat_service, mock_orchestrator):
        chat_service.set_orchestrator(mock_orchestrator)
        result = await chat_service.send_message("no-room", "c1", "hello")
        assert result is False


class TestAIGeneration:
    @pytest.mark.asyncio
    async def test_generate_ai_response(self, svc_with_room, sample_character, mock_orchestrator):
        svc, room = svc_with_room
        response = await svc.generate_ai_response(room.id, sample_character.id)
        assert response is not None
        mock_orchestrator.generate_non_stream.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_without_orchestrator(self, chat_service, sample_character):
        """未注入 orchestrator 时应返回 None"""
        room = chat_service.create_chat_room("测试茶室")
        chat_service.add_character_to_room(room.id, sample_character)
        result = await chat_service.generate_ai_response(room.id, sample_character.id)
        assert result is None

    def test_orchestrator_build_messages_with_variable_context(self, sample_character):
        orch = ChatOrchestrator(ProviderRegistry())
        messages = orch._build_openai_messages(
            character=sample_character,
            conversation_history=[],
            variable_context={
                "room": {"mood": "calm"},
                "global": {"site": "lobby"},
            },
        )
        variable_block = next(
            (
                msg.content
                for msg in messages
                if msg.role == ChatRole.SYSTEM and "room.mood" in msg.content
            ),
            "",
        )
        assert variable_block
        assert "room.mood = \"calm\"" in variable_block
        assert "global.site = \"lobby\"" in variable_block


class TestRoomSettings:
    def test_update_settings(self, chat_service):
        room = chat_service.create_chat_room("测试茶室")
        result = chat_service.update_room_settings(
            room.id, stealth_mode=True, name="新名字"
        )
        assert result is True
        assert room.stealth_mode is True
        assert room.name == "新名字"

    def test_update_nonexistent_room(self, chat_service):
        result = chat_service.update_room_settings("no-room", name="新名字")
        assert result is False
