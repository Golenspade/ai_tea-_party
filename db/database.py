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
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                personality TEXT NOT NULL,
                background TEXT NOT NULL,
                speaking_style TEXT DEFAULT '',
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

            CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
            CREATE INDEX IF NOT EXISTS idx_room_characters_room ON room_characters(room_id);
        """)
        await db.commit()

    logger.info(f"数据库初始化完成: {DB_PATH}")
