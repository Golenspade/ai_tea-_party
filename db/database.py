"""
SQLite 数据库模块 — 异步初始化和连接管理
"""

import logging
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = Path("data/tea_party.db")


async def init_db():
    """初始化数据库表结构"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                stealth_mode INTEGER DEFAULT 0,
                user_description TEXT DEFAULT '',
                persona_id TEXT DEFAULT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                personality TEXT NOT NULL,
                background TEXT NOT NULL,
                description TEXT DEFAULT '',
                scenario TEXT DEFAULT '',
                speaking_style TEXT DEFAULT '',
                system_prompt_override TEXT DEFAULT '',
                post_instructions TEXT DEFAULT '',
                greeting TEXT DEFAULT '',
                creator_notes TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                is_active INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS room_characters (
                room_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                PRIMARY KEY (room_id, character_id),
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                character_id TEXT NOT NULL,
                character_name TEXT NOT NULL,
                content TEXT NOT NULL,
                is_system INTEGER DEFAULT 0,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            );

            -- 示例对话
            CREATE TABLE IF NOT EXISTS example_dialogues (
                id TEXT PRIMARY KEY,
                character_id TEXT NOT NULL,
                user_message TEXT NOT NULL,
                character_response TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
            );

            -- 用户人设
            CREATE TABLE IF NOT EXISTS personas (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                is_default INTEGER DEFAULT 0
            );

            -- 世界观知识库
            CREATE TABLE IF NOT EXISTS world_info_books (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                enabled INTEGER DEFAULT 1
            );

            -- 世界观条目
            CREATE TABLE IF NOT EXISTS world_info_entries (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                keys TEXT NOT NULL,
                secondary_keys TEXT DEFAULT '[]',
                selective_logic TEXT DEFAULT 'AND',
                content TEXT NOT NULL,
                position TEXT DEFAULT 'after_char',
                depth INTEGER DEFAULT 4,
                enabled INTEGER DEFAULT 1,
                constant INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 100,
                FOREIGN KEY (book_id) REFERENCES world_info_books(id) ON DELETE CASCADE
            );

            -- 房间 ↔ 世界观关联
            CREATE TABLE IF NOT EXISTS room_worldinfo (
                room_id TEXT NOT NULL,
                book_id TEXT NOT NULL,
                PRIMARY KEY (room_id, book_id)
            );

            CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
            CREATE INDEX IF NOT EXISTS idx_room_characters_room ON room_characters(room_id);
            CREATE INDEX IF NOT EXISTS idx_example_dialogues_char ON example_dialogues(character_id);
            CREATE INDEX IF NOT EXISTS idx_wi_entries_book ON world_info_entries(book_id);
        """)
        await db.commit()

    logger.info(f"数据库初始化完成: {DB_PATH}")
