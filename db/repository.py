"""
数据库 CRUD 操作封装
"""

import json
import logging
from datetime import datetime
from typing import List

import aiosqlite

from db.database import DB_PATH
from models.character import Character, ChatRoom, ExampleDialogue, Message
from models.persona import Persona
from models.world_info import WIPosition, WorldInfoBook, WorldInfoEntry

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
                """SELECT c.id, c.name, c.personality, c.background,
                          c.description, c.scenario, c.speaking_style,
                          c.system_prompt_override, c.post_instructions,
                          c.greeting, c.creator_notes, c.tags, c.is_active
                   FROM characters c
                   JOIN room_characters rc ON c.id = rc.character_id
                   WHERE rc.room_id = ?""",
                (room_id,),
            )
            char_rows = await cursor2.fetchall()
            characters = []
            for crow in char_rows:
                # 加载示例对话
                cursor_ex = await db.execute(
                    """SELECT user_message, character_response
                       FROM example_dialogues
                       WHERE character_id = ? ORDER BY sort_order""",
                    (crow[0],),
                )
                ex_rows = await cursor_ex.fetchall()
                examples = [
                    ExampleDialogue(user_message=er[0], character_response=er[1])
                    for er in ex_rows
                ]
                characters.append(Character(
                    id=crow[0], name=crow[1], personality=crow[2],
                    background=crow[3], description=crow[4] or "",
                    scenario=crow[5] or "", speaking_style=crow[6] or "",
                    system_prompt_override=crow[7] or "",
                    post_instructions=crow[8] or "",
                    greeting=crow[9] or "",
                    creator_notes=crow[10] or "",
                    tags=json.loads(crow[11]) if crow[11] else [],
                    is_active=bool(crow[12]),
                    example_dialogues=examples,
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
    """保存角色并关联到聊天室（支持 CharacterCard 扩展字段）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO characters (
                   id, name, personality, background, description, scenario,
                   speaking_style, system_prompt_override, post_instructions,
                   greeting, creator_notes, tags, is_active
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 personality = excluded.personality,
                 background = excluded.background,
                 description = excluded.description,
                 scenario = excluded.scenario,
                 speaking_style = excluded.speaking_style,
                 system_prompt_override = excluded.system_prompt_override,
                 post_instructions = excluded.post_instructions,
                 greeting = excluded.greeting,
                 creator_notes = excluded.creator_notes,
                 tags = excluded.tags,
                 is_active = excluded.is_active""",
            (character.id, character.name, character.personality,
             character.background, character.description or "",
             character.scenario or "",
             character.speaking_style or "",
             character.system_prompt_override or "",
             character.post_instructions or "",
             character.greeting or "",
             character.creator_notes or "",
             json.dumps(character.tags),
             int(character.is_active)),
        )
        await db.execute(
            "INSERT OR IGNORE INTO room_characters (room_id, character_id) VALUES (?, ?)",
            (room_id, character.id),
        )
        # 保存示例对话
        await db.execute(
            "DELETE FROM example_dialogues WHERE character_id = ?",
            (character.id,),
        )
        for i, ex in enumerate(character.example_dialogues):
            import uuid as _uuid
            await db.execute(
                """INSERT INTO example_dialogues (id, character_id, user_message, character_response, sort_order)
                   VALUES (?, ?, ?, ?, ?)""",
                (str(_uuid.uuid4()), character.id, ex.user_message, ex.character_response, i),
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


# ─── Persona ─────────────────────────────────────────────────────────

async def save_persona(persona: Persona):
    """保存用户人设"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO personas (id, name, description, is_default)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 description = excluded.description,
                 is_default = excluded.is_default""",
            (persona.id, persona.name, persona.description, int(persona.is_default)),
        )
        await db.commit()


async def load_all_personas() -> List[Persona]:
    """加载所有人设"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute("SELECT id, name, description, is_default FROM personas")
        rows = await cursor.fetchall()
        return [
            Persona(id=r[0], name=r[1], description=r[2] or "", is_default=bool(r[3]))
            for r in rows
        ]


async def delete_persona(persona_id: str):
    """删除人设"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("DELETE FROM personas WHERE id = ?", (persona_id,))
        await db.commit()


# ─── World Info ──────────────────────────────────────────────────────

async def save_world_info_book(book: WorldInfoBook):
    """保存世界观知识库（不含条目）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO world_info_books (id, name, description, enabled)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 description = excluded.description,
                 enabled = excluded.enabled""",
            (book.id, book.name, book.description, int(book.enabled)),
        )
        await db.commit()


async def load_all_world_info_books() -> List[WorldInfoBook]:
    """加载所有世界观知识库（含条目）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            "SELECT id, name, description, enabled FROM world_info_books"
        )
        book_rows = await cursor.fetchall()

        books = []
        for brow in book_rows:
            cursor2 = await db.execute(
                """SELECT id, keys, secondary_keys, selective_logic,
                          content, position, depth, enabled, constant, sort_order
                   FROM world_info_entries WHERE book_id = ? ORDER BY sort_order""",
                (brow[0],),
            )
            entry_rows = await cursor2.fetchall()
            entries = [
                WorldInfoEntry(
                    id=er[0],
                    keys=json.loads(er[1]),
                    secondary_keys=json.loads(er[2]) if er[2] else [],
                    selective_logic=er[3] or "AND",
                    content=er[4],
                    position=WIPosition(er[5]) if er[5] else WIPosition.AFTER_CHAR,
                    depth=er[6] or 4,
                    enabled=bool(er[7]),
                    constant=bool(er[8]),
                    order=er[9] or 100,
                )
                for er in entry_rows
            ]
            books.append(WorldInfoBook(
                id=brow[0], name=brow[1],
                description=brow[2] or "", enabled=bool(brow[3]),
                entries=entries,
            ))
        return books


async def delete_world_info_book(book_id: str):
    """删除知识库（级联删除条目）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("DELETE FROM world_info_books WHERE id = ?", (book_id,))
        await db.execute("DELETE FROM world_info_entries WHERE book_id = ?", (book_id,))
        await db.execute("DELETE FROM room_worldinfo WHERE book_id = ?", (book_id,))
        await db.commit()


async def save_world_info_entry(entry: WorldInfoEntry, book_id: str):
    """保存单条世界观条目"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """INSERT INTO world_info_entries
                   (id, book_id, keys, secondary_keys, selective_logic,
                    content, position, depth, enabled, constant, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 keys = excluded.keys,
                 secondary_keys = excluded.secondary_keys,
                 selective_logic = excluded.selective_logic,
                 content = excluded.content,
                 position = excluded.position,
                 depth = excluded.depth,
                 enabled = excluded.enabled,
                 constant = excluded.constant,
                 sort_order = excluded.sort_order""",
            (entry.id, book_id, json.dumps(entry.keys),
             json.dumps(entry.secondary_keys), entry.selective_logic,
             entry.content, entry.position.value, entry.depth,
             int(entry.enabled), int(entry.constant), entry.order),
        )
        await db.commit()


async def delete_world_info_entry(entry_id: str):
    """删除单条世界观条目"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("DELETE FROM world_info_entries WHERE id = ?", (entry_id,))
        await db.commit()


# ─── Room ↔ WorldInfo 关联 ───────────────────────────────────────────

async def bind_room_worldinfo(room_id: str, book_id: str):
    """绑定知识库到聊天室"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            "INSERT OR IGNORE INTO room_worldinfo (room_id, book_id) VALUES (?, ?)",
            (room_id, book_id),
        )
        await db.commit()


async def unbind_room_worldinfo(room_id: str, book_id: str):
    """解绑知识库和聊天室"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            "DELETE FROM room_worldinfo WHERE room_id = ? AND book_id = ?",
            (room_id, book_id),
        )
        await db.commit()


async def load_room_worldinfo_books(room_id: str) -> List[WorldInfoBook]:
    """加载某个聊天室绑定的所有知识库（含条目）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            """SELECT wb.id, wb.name, wb.description, wb.enabled
               FROM world_info_books wb
               JOIN room_worldinfo rw ON wb.id = rw.book_id
               WHERE rw.room_id = ?""",
            (room_id,),
        )
        book_rows = await cursor.fetchall()

        books = []
        for brow in book_rows:
            cursor2 = await db.execute(
                """SELECT id, keys, secondary_keys, selective_logic,
                          content, position, depth, enabled, constant, sort_order
                   FROM world_info_entries WHERE book_id = ? ORDER BY sort_order""",
                (brow[0],),
            )
            entry_rows = await cursor2.fetchall()
            entries = [
                WorldInfoEntry(
                    id=er[0],
                    keys=json.loads(er[1]),
                    secondary_keys=json.loads(er[2]) if er[2] else [],
                    selective_logic=er[3] or "AND",
                    content=er[4],
                    position=WIPosition(er[5]) if er[5] else WIPosition.AFTER_CHAR,
                    depth=er[6] or 4,
                    enabled=bool(er[7]),
                    constant=bool(er[8]),
                    order=er[9] or 100,
                )
                for er in entry_rows
            ]
            books.append(WorldInfoBook(
                id=brow[0], name=brow[1],
                description=brow[2] or "", enabled=bool(brow[3]),
                entries=entries,
            ))
        return books


# ─── Settings (KV) ───────────────────────────────────────────────────


async def get_setting(key: str, default: str = "") -> str:
    """读取设置值，不存在则返回默认值"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        )
        row = await cursor.fetchone()
        return row[0] if row else default


async def set_setting(key: str, value: str) -> None:
    """写入设置值（upsert）"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )
        await db.commit()
