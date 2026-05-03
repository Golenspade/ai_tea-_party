"""
tests/test_api.py — REST API 端点测试

使用 FastAPI TestClient 测试 API 端点，mock 掉 Orchestrator 和 WebSocket。
"""


from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from models.character import Message

from routes.rest import setup_rest_routes
from routes.ws import WebSocketManager
from services.chat_service import ChatService


def _noop_create_task(coro):
    """替代 asyncio.create_task"""
    coro.close()
    return MagicMock()


@pytest.fixture
def api_client():
    """创建一个测试用的 FastAPI 应用和客户端，mock 掉所有 DB 操作"""
    with (
        patch("services.chat_service.db") as mock_db,
        patch("services.chat_service.asyncio.create_task", side_effect=_noop_create_task),
        patch("db.repository.save_room", new_callable=AsyncMock),
        patch("db.repository.save_character", new_callable=AsyncMock),
        patch("db.repository.save_message", new_callable=AsyncMock),
        patch("db.repository.clear_messages", new_callable=AsyncMock),
        patch("db.repository.remove_character_from_room", new_callable=AsyncMock),
    ):
        mock_db.save_room = AsyncMock()
        mock_db.save_character = AsyncMock()
        mock_db.save_message = AsyncMock()
        mock_db.remove_character_from_room = AsyncMock()
        mock_db.clear_messages = AsyncMock()

        svc = ChatService()
        # 创建默认聊天室并预设角色
        from models.character import Character as Char
        default_room = svc.create_chat_room("默认茶室")
        default_room.id = "default"
        svc.chat_rooms["default"] = default_room

        # 预设一个角色用于测试（直接加入 model 层，避免 create_task）
        preset_char = Char(id="preset-char", name="预设角色", personality="测试", background="测试")
        default_room.add_character(preset_char)

        orch = MagicMock()
        orch.is_configured.return_value = True
        orch.get_current_config.return_value = {"provider": "mock", "model": "mock-model"}
        orch.test_connection = AsyncMock(return_value={"status": "ok"})

        ws = WebSocketManager()

        app = FastAPI()
        app.include_router(setup_rest_routes(orch, svc, ws, "default"))

        yield TestClient(app), svc, orch


class TestHealthEndpoint:
    def test_health(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["ai_configured"] is True

    def test_status(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "configured"


class TestRoomEndpoints:
    def test_list_rooms(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/rooms")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["rooms"]) >= 1

    def test_create_room(self, api_client):
        client, svc, _ = api_client
        resp = client.post("/api/rooms", json={"name": "新茶室"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["room"]["name"] == "新茶室"

    def test_update_room(self, api_client):
        client, _, _ = api_client
        resp = client.put("/api/rooms/default", json={"name": "改名茶室"})
        assert resp.status_code == 200

    def test_update_nonexistent_room(self, api_client):
        client, _, _ = api_client
        resp = client.put("/api/rooms/no-room", json={"name": "不存在"})
        assert resp.status_code == 404


class TestCharacterEndpoints:
    def test_get_characters(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/rooms/default/characters")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_add_character(self, api_client):
        client, _, _ = api_client
        resp = client.post(
            "/api/rooms/default/characters",
            json={
                "name": "API小茶",
                "personality": "温柔",
                "background": "茶道师",
            },
        )
        assert resp.status_code == 200
        assert "character_id" in resp.json()

    def test_add_character_with_extended_fields(self, api_client):
        client, _, _ = api_client
        resp = client.post(
            "/api/characters",
            json={
                "name": "扩展角色",
                "personality": "活泼",
                "background": "默认背景",
                "description": "详细描述",
                "scenario": "茶室内景",
                "system_prompt_override": "你是茶桌管理员",
                "post_instructions": "回复长度 20 字以内",
                "greeting": "欢迎来到茶室",
                "creator_notes": "测试人物",
                "tags": ["测试", "扩展"],
                "example_dialogues": [
                    {"user_message": "你好", "character_response": "在，您请"},
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["description"] == "详细描述"
        assert data["scenario"] == "茶室内景"
        assert data["tags"] == ["测试", "扩展"]
        assert data["example_dialogues"][0]["user_message"] == "你好"

    def test_add_character_nonexistent_room(self, api_client):
        client, _, _ = api_client
        resp = client.post(
            "/api/rooms/no-room/characters",
            json={"name": "小茶", "personality": "温柔", "background": "茶道师"},
        )
        assert resp.status_code == 404

    def test_remove_character(self, api_client):
        client, svc, _ = api_client
        # 使用预设角色
        resp = client.delete("/api/rooms/default/characters/preset-char")
        assert resp.status_code == 200


class TestMessageEndpoints:
    def test_get_messages(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/rooms/default/messages")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_messages_with_since(self, api_client):
        client, svc, _ = api_client
        room = svc.get_chat_room("default")
        assert room is not None
        room.messages.clear()

        now = datetime.now()
        room.add_message(
            Message(
                character_id="preset-char",
                character_name="预设角色",
                content="旧消息",
                timestamp=now - timedelta(minutes=1),
            )
        )
        room.add_message(
            Message(
                character_id="preset-char",
                character_name="预设角色",
                content="新消息",
                timestamp=now,
            )
        )

        since = (now - timedelta(seconds=30)).isoformat()
        resp = client.get(f"/api/rooms/default/messages?since={since}")
        assert resp.status_code == 200
        payload = resp.json()
        assert len(payload) == 1
        assert payload[0]["content"] == "新消息"

    def test_get_messages_invalid_since(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/rooms/default/messages?since=not-a-time")
        assert resp.status_code == 400

    def test_get_messages_nonexistent_room(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/rooms/no-room/messages")
        assert resp.status_code == 404

    def test_send_message_invalid_room(self, api_client):
        """发送到不存在房间应返回 404"""
        client, _, _ = api_client
        resp = client.post(
            "/api/rooms/no-room/messages",
            json={"character_id": "preset-char", "content": "test"},
        )
        assert resp.status_code == 404


class TestAutoChatEndpoints:
    def test_start_auto_chat(self, api_client):
        client, svc, _ = api_client
        room = svc.get_chat_room("default")
        assert room is not None
        resp = client.post("/api/rooms/default/auto-chat/start")
        assert resp.status_code == 200
        assert room.is_auto_chat is True

    def test_stop_auto_chat(self, api_client):
        client, svc, _ = api_client
        room = svc.get_chat_room("default")
        assert room is not None
        room.is_auto_chat = True
        resp = client.post("/api/rooms/default/auto-chat/stop")
        assert resp.status_code == 200
        assert room.is_auto_chat is False

    def test_start_auto_chat_not_found(self, api_client):
        client, _, _ = api_client
        resp = client.post("/api/rooms/no-room/auto-chat/start")
        assert resp.status_code == 404

    def test_stop_auto_chat_not_found(self, api_client):
        client, _, _ = api_client
        resp = client.post("/api/rooms/no-room/auto-chat/stop")
        assert resp.status_code == 404


class TestConfigEndpoints:
    def test_get_config(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "providers" in data
