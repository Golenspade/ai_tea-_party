import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ChatRoom,
  BehaviorRule,
  Message,
  RoomBarSnapshot,
  VariableEntry,
  WorldInfoBook,
} from "@ai-party/shared";

import { buildRoomArchiveSnapshot } from "./archive-builder";

const room: ChatRoom = {
  id: "room-1",
  name: "归档房间",
  description: "测试",
  characters: [],
  messages: [],
  is_auto_chat: false,
  max_history: 50,
  created_at: "2026-06-09T00:00:00.000Z",
  stealth_mode: false,
  user_description: "",
};

const messages: Message[] = [
  {
    id: "message-1",
    character_id: "user",
    character_name: "访客",
    content: "开场",
    timestamp: "2026-06-09T00:00:00.000Z",
    is_system: false,
    sender_type: "user",
  },
  {
    id: "message-2",
    character_id: "char-1",
    character_name: "主持",
    content: "欢迎。",
    timestamp: "2026-06-09T00:00:01.000Z",
    is_system: false,
    sender_type: "ai",
  },
];

const roomVariables: VariableEntry[] = [
  { name: "danger", value: 8, scope: "room" },
];

const globalVariables: VariableEntry[] = [
  { name: "chapter", value: "phase-3", scope: "global" },
];

const roomBar: RoomBarSnapshot = {
  room_id: "room-1",
  content: "茶室入夜。",
  label: "当前形势",
  version: 3,
  updated_at: "2026-06-09T00:00:02.000Z",
};

const worldInfoBooks: WorldInfoBook[] = [
  {
    id: "book-1",
    name: "世界书",
    description: "",
    enabled: true,
    entries: [],
  },
];

const behaviorRules: BehaviorRule[] = [
  {
    id: "rule-1",
    room_id: "room-1",
    name: "高风险",
    enabled: true,
    priority: 10,
    conditions: [{ scope: "room", name: "danger", op: "gte", value: 8 }],
    condition_logic: "AND",
    prompt_text: "角色应优先自保。",
    created_at: "2026-06-09T00:00:02.000Z",
    updated_at: "2026-06-09T00:00:02.000Z",
  },
];

describe("buildRoomArchiveSnapshot", () => {
  it("builds a complete room archive manifest and payload", () => {
    const archive = buildRoomArchiveSnapshot({
      archiveId: "archive-1",
      title: "测试归档",
      createdAt: "2026-06-09T00:00:03.000Z",
      room,
      messages,
      summaries: [],
      roomVariables,
      globalVariables,
      roomBar,
      worldInfoBooks,
      behaviorRules,
    });

    assert.equal(archive.manifest.schema_version, 1);
    assert.equal(archive.manifest.archive_id, "archive-1");
    assert.equal(archive.manifest.message_count, 2);
    assert.equal(archive.manifest.variable_count, 2);
    assert.equal(archive.manifest.bar_version, 3);
    assert.deepEqual(archive.manifest.world_info_book_ids, ["book-1"]);
    assert.equal(archive.room.messages.length, 2);
    assert.equal(archive.messages[1]?.content, "欢迎。");
    assert.equal(archive.room_variables[0]?.scope, "room");
    assert.equal(archive.global_variables[0]?.scope, "global");
    assert.equal(archive.room_bar?.content, "茶室入夜。");
    assert.equal(archive.world_info_books[0]?.name, "世界书");
    assert.equal(archive.behavior_rules[0]?.prompt_text, "角色应优先自保。");
  });
});
