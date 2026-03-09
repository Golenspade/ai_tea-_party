"""
tests/test_models.py — 数据模型单元测试
"""

from models.character import Character, ChatRoom, Message


class TestCharacter:
    def test_create_character(self):
        c = Character(name="小茶", personality="温柔", background="茶道师")
        assert c.name == "小茶"
        assert c.personality == "温柔"
        assert c.is_active is True
        assert c.id  # 自动生成 UUID

    def test_get_system_prompt(self):
        c = Character(
            name="小茶", personality="温柔体贴", background="茶道师", speaking_style="温和"
        )
        prompt = c.get_system_prompt()
        assert "小茶" in prompt
        assert "温柔体贴" in prompt
        assert "茶道师" in prompt
        assert "温和" in prompt

    def test_system_prompt_without_style(self):
        c = Character(name="小茶", personality="温柔", background="茶道师")
        prompt = c.get_system_prompt()
        assert "说话风格" not in prompt


class TestMessage:
    def test_create_message(self):
        m = Message(character_id="c1", character_name="小茶", content="你好")
        assert m.content == "你好"
        assert m.is_system is False
        assert m.id

    def test_system_message(self):
        m = Message(
            character_id="system", character_name="系统", content="系统消息", is_system=True
        )
        assert m.is_system is True


class TestChatRoom:
    def test_create_room(self):
        room = ChatRoom(name="测试聊天室")
        assert room.name == "测试聊天室"
        assert len(room.characters) == 0
        assert len(room.messages) == 0

    def test_add_character(self, sample_character):
        room = ChatRoom(name="测试聊天室")
        room.add_character(sample_character)
        assert len(room.characters) == 1
        assert room.characters[0].name == "小茶"

    def test_add_duplicate_character(self, sample_character):
        room = ChatRoom(name="测试聊天室")
        room.add_character(sample_character)
        room.add_character(sample_character)  # 不应重复添加
        assert len(room.characters) == 1

    def test_remove_character(self, sample_character):
        room = ChatRoom(name="测试聊天室")
        room.add_character(sample_character)
        room.remove_character(sample_character.id)
        assert len(room.characters) == 0

    def test_add_message(self, sample_message):
        room = ChatRoom(name="测试聊天室")
        room.add_message(sample_message)
        assert len(room.messages) == 1

    def test_message_history_limit(self):
        room = ChatRoom(name="测试聊天室", max_history=5)
        for i in range(10):
            msg = Message(character_id="c1", character_name="测试", content=f"消息 {i}")
            room.add_message(msg)
        assert len(room.messages) == 5
        assert room.messages[0].content == "消息 5"

    def test_get_recent_messages(self, sample_message):
        room = ChatRoom(name="测试聊天室")
        room.add_message(sample_message)
        recent = room.get_recent_messages(10)
        assert len(recent) == 1

    def test_get_active_characters(self, sample_character):
        room = ChatRoom(name="测试聊天室")
        room.add_character(sample_character)
        inactive = Character(
            name="沉默者", personality="安静", background="背景", is_active=False
        )
        room.add_character(inactive)
        active = room.get_active_characters()
        assert len(active) == 1
        assert active[0].name == "小茶"

    def test_stealth_mode(self):
        room = ChatRoom(name="测试聊天室", stealth_mode=True)
        assert room.stealth_mode is True
