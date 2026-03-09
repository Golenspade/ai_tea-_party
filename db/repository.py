"""
数据库 CRUD 操作封装
"""

import logging
from datetime import datetime
from typing import List

import aiosqlite

from db.database import DB_PATH
from models.character import Character, ChatRoom, Message

logger = logging.getLogger(__name__)


# ─── Room ────────────────────────────────────────────────────────────

async def save_room(room: ChatRoom):
    """保存聊天室到数据库（upsert）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO rooms (id, name, description, stealth_mode, user_description, created_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 description = excluded.description,
                 stealth_mode = excluded.stealth_mode,
                 user_description = excluded.user_description""",
            (room.id, room.name, room.description,
             int(room.stealth_mode), room.user_description,
             room.created_at.isoformat()),
        )
        await db.commit()


async def load_all_rooms() -> List[dict]:
    """加载所有聊天室（含角色和消息）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        # 1. 加载所有房间
        cursor = await db.execute(
            "SELECT id, name, description, stealth_mode, user_description, created_at FROM rooms"
        )
        room_rows = await cursor.fetchall()

        rooms = []
        for row in room_rows:
            room_id, name, description, stealth_mode, user_description, created_at = row

            # 2. 加载该房间的角色
            cursor2 = await db.execute(
                """SELECT c.id, c.name, c.personality, c.background, c.speaking_style, c.is_active
                   FROM characters c
                   JOIN room_characters rc ON c.id = rc.character_id
                   WHERE rc.room_id = ?""",
                (room_id,),
            )
            char_rows = await cursor2.fetchall()
            characters = []
            for crow in char_rows:
                characters.append(Character(
                    id=crow[0], name=crow[1], personality=crow[2],
                    background=crow[3], speaking_style=crow[4] or "",
                    is_active=bool(crow[5]),
                ))

            # 3. 加载该房间的消息（按时间排序，最多 50 条）
            cursor3 = await db.execute(
                """SELECT id, character_id, character_name, content, is_system, timestamp
                   FROM messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT 50""",
                (room_id,),
            )
            msg_rows = await cursor3.fetchall()
            messages = []
            for mrow in msg_rows:
                messages.append(Message(
                    id=mrow[0], character_id=mrow[1], character_name=mrow[2],
                    content=mrow[3], is_system=bool(mrow[4]),
                    timestamp=datetime.fromisoformat(mrow[5]),
                ))

            rooms.append({
                "id": room_id,
                "name": name,
                "description": description or "",
                "stealth_mode": bool(stealth_mode),
                "user_description": user_description or "",
                "created_at": created_at,
                "characters": characters,
                "messages": messages,
            })

        return rooms


# ─── Character ───────────────────────────────────────────────────────

async def save_character(character: Character, room_id: str):
    """保存角色并关联到聊天室"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO characters (id, name, personality, background, speaking_style, is_active)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 personality = excluded.personality,
                 background = excluded.background,
                 speaking_style = excluded.speaking_style,
                 is_active = excluded.is_active""",
            (character.id, character.name, character.personality,
             character.background, character.speaking_style or "",
             int(character.is_active)),
        )
        await db.execute(
            "INSERT OR IGNORE INTO room_characters (room_id, character_id) VALUES (?, ?)",
            (room_id, character.id),
        )
        await db.commit()


async def remove_character_from_room(room_id: str, character_id: str):
    """从聊天室移除角色关联"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            "DELETE FROM room_characters WHERE room_id = ? AND character_id = ?",
            (room_id, character_id),
        )
        await db.commit()


# ─── Message ─────────────────────────────────────────────────────────

async def save_message(message: Message, room_id: str):
    """保存消息到数据库"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO messages (id, room_id, character_id, character_name, content, is_system, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET content = excluded.content""",
            (message.id, room_id, message.character_id,
             message.character_name, message.content,
             int(message.is_system), message.timestamp.isoformat()),
        )
        await db.commit()


async def clear_messages(room_id: str):
    """清空聊天室消息"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("DELETE FROM messages WHERE room_id = ?", (room_id,))
        await db.commit()


async def room_exists_in_db(room_id: str) -> bool:
    """检查聊天室是否已存在于数据库"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute("SELECT 1 FROM rooms WHERE id = ?", (room_id,))
        return await cursor.fetchone() is not None
