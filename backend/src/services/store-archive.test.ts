import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { Message, WorldInfoEntry } from "@ai-party/shared";

import AppState from "../store";

function withState(run: (state: AppState, tempDir: string) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-store-archive-"));
  process.env.DB_PATH = join(tempDir, "store.db");
  process.env.ARCHIVE_DIR = join(tempDir, "archives");
  process.env.OPENAI_API_KEY = "secret-archive-key";

  try {
    const state = new AppState();
    state.createRoom("Archive 测试房间", "", { id: "room-1" });
    run(state, tempDir);
  } finally {
    delete process.env.DB_PATH;
    delete process.env.ARCHIVE_DIR;
    delete process.env.OPENAI_API_KEY;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeMessage(id: string, content: string): Message {
  return {
    id,
    character_id: "char-1",
    character_name: "主持",
    content,
    timestamp: `2026-06-09T00:00:0${id.at(-1) || "0"}.000Z`,
    is_system: false,
    sender_type: "ai",
  };
}

function makeWorldInfoEntry(): WorldInfoEntry {
  return {
    id: "entry-1",
    keys: ["茶室"],
    secondary_keys: [],
    selective_logic: "AND",
    content: "茶室有一盏旧灯。",
    position: "after_char",
    depth: 4,
    enabled: true,
    constant: false,
    order: 10,
  };
}

describe("AppState room archives", () => {
  it("creates a recoverable archive file with room state", () => {
    withState((state) => {
      state.addRoomMessage("room-1", makeMessage("message-1", "第一条"));
      state.addRoomMessage("room-1", makeMessage("message-2", "第二条"));
      state.setVariable("room", "room-1", "danger", 8);
      state.setVariable("global", "global", "chapter", "phase-3");
      state.writeAgentBar("room-1", { content: "茶室入夜。", label: "当前形势" });

      const book = state.createWorldInfoBook("测试世界书");
      state.upsertWorldInfoEntry(book.id, makeWorldInfoEntry());
      state.setRoomWorldInfo("room-1", [book.id]);
      state.upsertBehaviorRule("room-1", {
        name: "高风险行为",
        conditions: [{ scope: "room", name: "danger", op: "gte", value: 8 }],
        condition_logic: "AND",
        prompt_text: "角色应优先自保。",
      });

      const record = state.createRoomArchive("room-1", "手动归档");

      assert.equal(record.room_id, "room-1");
      assert.equal(record.title, "手动归档");
      assert.equal(record.manifest.message_count, 2);
      assert.equal(record.manifest.variable_count, 2);
      assert.equal(record.manifest.world_info_book_ids.length, 1);
      assert.ok(record.file_path);
      assert.ok(existsSync(record.file_path || ""));

      const archives = state.listRoomArchives("room-1");
      assert.equal(archives.length, 1);
      assert.equal(archives[0]?.id, record.id);

      const archive = state.getRoomArchive("room-1", record.id);
      assert.equal(archive?.messages.length, 2);
      assert.equal(archive?.messages[0]?.content, "第一条");
      assert.equal(archive?.room_variables[0]?.name, "danger");
      assert.equal(archive?.global_variables[0]?.name, "chapter");
      assert.equal(archive?.room_bar?.content, "茶室入夜。");
      assert.equal(archive?.world_info_books[0]?.entries[0]?.content, "茶室有一盏旧灯。");
      assert.equal(archive?.behavior_rules[0]?.prompt_text, "角色应优先自保。");

      const raw = readFileSync(record.file_path || "", "utf8");
      assert.doesNotMatch(raw, /secret-archive-key/);
      assert.doesNotMatch(raw, /api_key/i);
    });
  });

  it("returns undefined when reading an archive from another room", () => {
    withState((state) => {
      state.createRoom("另一个房间", "", { id: "room-2" });
      const record = state.createRoomArchive("room-1", "手动归档");

      assert.equal(state.getRoomArchive("room-2", record.id), undefined);
    });
  });

  it("rejects archives for missing rooms", () => {
    withState((state) => {
      assert.throws(() => state.createRoomArchive("missing"), /聊天室不存在/);
      assert.deepEqual(state.listRoomArchives("missing"), []);
      assert.deepEqual(state.listRoomSummaries("missing"), []);
    });
  });
});
