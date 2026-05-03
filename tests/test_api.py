"""
tests/test_api.py — REST API 端点测试

使用 FastAPI TestClient 测试 API 端点，mock 掉 Orchestrator 和 WebSocket。
"""


from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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
        patch("db.repository.get_room_variable", new_callable=AsyncMock),
        patch("db.repository.set_room_variable", new_callable=AsyncMock),
        patch("db.repository.room_variable_exists", new_callable=AsyncMock, return_value=False),
        patch("db.repository.add_room_variable", new_callable=AsyncMock),
        patch("db.repository.inc_room_variable", new_callable=AsyncMock),
        patch("db.repository.dec_room_variable", new_callable=AsyncMock),
        patch("db.repository.delete_room_variable", new_callable=AsyncMock),
        patch("db.repository.list_room_variables", new_callable=AsyncMock, return_value={} ),
        patch("db.repository.get_global_variable", new_callable=AsyncMock),
        patch("db.repository.set_global_variable", new_callable=AsyncMock),
        patch("db.repository.delete_global_variable", new_callable=AsyncMock),
        patch("db.repository.add_global_variable", new_callable=AsyncMock),
        patch("db.repository.inc_global_variable", new_callable=AsyncMock),
        patch("db.repository.dec_global_variable", new_callable=AsyncMock),
        patch("db.repository.list_global_variables", new_callable=AsyncMock, return_value={} ),
    ):
        mock_db.save_room = AsyncMock()
        mock_db.save_character = AsyncMock()
        mock_db.save_message = AsyncMock()
        mock_db.remove_character_from_room = AsyncMock()
        mock_db.clear_messages = AsyncMock()

        # 变量端点默认 Mock
        repo.get_room_variable.return_value = None
        repo.set_room_variable.return_value = None
        repo.room_variable_exists.return_value = False
        repo.add_room_variable.return_value = None
        repo.inc_room_variable.return_value = None
        repo.dec_room_variable.return_value = None
        repo.delete_room_variable.return_value = None
        repo.list_room_variables.return_value = {}
        repo.get_global_variable.return_value = None
        repo.set_global_variable.return_value = None
        repo.delete_global_variable.return_value = None
        repo.add_global_variable.return_value = None
        repo.inc_global_variable.return_value = None
        repo.dec_global_variable.return_value = None
        repo.list_global_variables.return_value = {}

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


class TestVariableApiEndpoints:
    def test_list_room_variables(self, api_client, monkeypatch):
        client, _, _ = api_client

        async def list_vars(*_args, **_kwargs):
            return {"mood": "calm", "counter": 3}

        monkeypatch.setattr("db.repository.list_room_variables", list_vars)
        resp = client.get("/api/rooms/default/variables")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["scope"] == "room"
        assert payload["room_id"] == "default"
        assert len(payload["variables"]) == 2
        vars_map = {v["name"]: v["value"] for v in payload["variables"]}
        assert vars_map["mood"] == "calm"
        assert vars_map["counter"] == 3

    def test_create_room_variable(self, api_client, monkeypatch):
        client, _, _ = api_client

        state = {}

        async def exists(room_id, name):
            return name in state

        async def set_var(room_id, name, value):
            state[name] = value

        async def list_vars(room_id):
            return dict(state)

        monkeypatch.setattr("db.repository.room_variable_exists", exists)
        monkeypatch.setattr("db.repository.set_room_variable", set_var)
        monkeypatch.setattr("db.repository.list_room_variables", list_vars)

        r1 = client.post(
            "/api/rooms/default/variables",
            json={"name": "mode", "value": "tea"},
        )
        assert r1.status_code == 200
        assert r1.json()["name"] == "mode"

        r2 = client.post(
            "/api/rooms/default/variables",
            json={"name": "mode", "value": "duplicate"},
        )
        assert r2.status_code == 409

    def test_set_room_variable(self, api_client, monkeypatch):
        client, _, _ = api_client

        state = {}

        async def set_var(room_id, name, value):
            state[name] = value

        async def list_vars(room_id):
            return dict(state)

        monkeypatch.setattr("db.repository.set_room_variable", set_var)
        monkeypatch.setattr("db.repository.list_room_variables", list_vars)

        resp = client.post(
            "/api/rooms/default/variables/set",
            json={"name": "count", "value": 10},
        )
        assert resp.status_code == 200
        assert resp.json()["value"] == 10

    def test_room_variable_add_inc_dec(self, api_client, monkeypatch):
        client, _, _ = api_client

        state = {"counter": 1}

        async def add_var(room_id, name, value):
            current = state.get(name)
            if isinstance(current, int):
                state[name] = current + value
            return state.get(name)

        async def inc_var(room_id, name, value):
            current = state.get(name)
            if current is None:
                state[name] = value
                return state[name]
            if not isinstance(current, (int, float)):
                return current
            state[name] = current + value
            return state[name]

        async def dec_var(room_id, name, value):
            current = state.get(name)
            if current is None:
                state[name] = -value
                return state[name]
            if not isinstance(current, (int, float)):
                return current
            state[name] = current - value
            return state[name]

        monkeypatch.setattr("db.repository.add_room_variable", add_var)
        monkeypatch.setattr("db.repository.inc_room_variable", inc_var)
        monkeypatch.setattr("db.repository.dec_room_variable", dec_var)

        add_resp = client.post(
            "/api/rooms/default/variables/add",
            json={"name": "counter", "value": 2},
        )
        assert add_resp.status_code == 200
        assert add_resp.json()["value"] == 3

        inc_resp = client.post(
            "/api/rooms/default/variables/inc",
            json={"name": "counter", "value": 4},
        )
        assert inc_resp.status_code == 200
        assert inc_resp.json()["value"] == 7

        dec_resp = client.post(
            "/api/rooms/default/variables/dec",
            json={"name": "counter", "value": 1},
        )
        assert dec_resp.status_code == 200
        assert dec_resp.json()["value"] == 6

    def test_delete_room_variable(self, api_client, monkeypatch):
        client, _, _ = api_client
        deleted = []

        async def delete_var(room_id, name):
            deleted.append((room_id, name))

        monkeypatch.setattr("db.repository.delete_room_variable", delete_var)
        resp = client.delete("/api/rooms/default/variables/obsolete")
        assert resp.status_code == 200
        assert deleted == [("default", "obsolete")]

    def test_variable_room_not_found(self, api_client):
        client, _, _ = api_client
        resp = client.get("/api/rooms/ghost/variables")
        assert resp.status_code == 404

    def test_global_variable_crud(self, api_client, monkeypatch):
        client, _, _ = api_client
        state = {}

        async def set_global(name, value):
            state[name] = value

        async def add_global(name, value):
            current = state.get(name)
            if isinstance(current, (list, str)):
                if isinstance(current, list) and not isinstance(value, list):
                    state[name] = current + [value]
                else:
                    state[name] = current + value
            elif isinstance(current, (int, float)):
                state[name] = current + value
            else:
                state[name] = value if current is None else current
            return state[name]

        async def inc_global(name, value):
            current = state.get(name)
            if current is None:
                state[name] = value
                return state[name]
            if not isinstance(current, (int, float)):
                return current
            state[name] = current + value
            return state[name]

        async def dec_global(name, value):
            current = state.get(name)
            if current is None:
                state[name] = -value
                return state[name]
            if not isinstance(current, (int, float)):
                return current
            state[name] = current - value
            return state[name]

        async def delete_global(name):
            state.pop(name, None)

        async def list_globals():
            return dict(state)

        async def get_global(name):
            return state.get(name)

        monkeypatch.setattr("db.repository.set_global_variable", set_global)
        monkeypatch.setattr("db.repository.add_global_variable", add_global)
        monkeypatch.setattr("db.repository.inc_global_variable", inc_global)
        monkeypatch.setattr("db.repository.dec_global_variable", dec_global)
        monkeypatch.setattr("db.repository.delete_global_variable", delete_global)
        monkeypatch.setattr("db.repository.list_global_variables", list_globals)
        monkeypatch.setattr("db.repository.get_global_variable", get_global)

        assert client.post("/api/variables/global/set", json={"name": "site", "value": 1}).status_code == 200
        assert client.post("/api/variables/global/add", json={"name": "site", "value": 2}).status_code == 200
        assert client.post("/api/variables/global/inc", json={"name": "site", "value": 3}).status_code == 200
        assert client.post("/api/variables/global/dec", json={"name": "site", "value": 1}).status_code == 200

        list_resp = client.get("/api/variables/global")
        assert list_resp.status_code == 200
        payload = list_resp.json()
        assert payload["scope"] == "global"
        assert payload["variables"][0]["name"] in {"site"}

        delete_resp = client.delete("/api/variables/global/site")
        assert delete_resp.status_code == 200

    def test_global_bad_op(self, api_client):
        client, _, _ = api_client
        resp = client.post("/api/variables/global/unknown", json={"name": "site", "value": 1})
        assert resp.status_code == 400

    def test_invalid_variable_json(self, api_client):
        client, _, _ = api_client
        resp = client.post(
            "/api/rooms/default/variables",
            data="{invalid-json}",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 422
