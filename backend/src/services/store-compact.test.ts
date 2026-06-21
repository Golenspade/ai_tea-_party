import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { Message } from "@ai-party/shared";

import AppState from "../store";

function withState(run: (state: AppState) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-store-compact-"));
  process.env.DB_PATH = join(tempDir, "store.db");

  try {
    const state = new AppState();
    state.createRoom("Compact 测试房间", "", { id: "room-1", max_history: 2 });
    run(state);
  } finally {
    delete process.env.DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeMessage(index: number): Message {
  return {
    id: `message-${index}`,
    character_id: "char-1",
    character_name: "主持",
    content: `第 ${index} 条消息`,
    timestamp: `2026-06-09T00:00:${String(index).padStart(2, "0")}.000Z`,
    is_system: false,
    sender_type: "ai",
  };
}

describe("AppState room compact", () => {
  it("dry-runs a compact summary without persisting it", () => {
    withState((state) => {
      for (let index = 1; index <= 5; index += 1) {
        state.addRoomMessage("room-1", makeMessage(index));
      }

      const result = state.compactRoom("room-1", { keep_recent: 2 });

      assert.equal(result.status, "dry_run");
      assert.equal(result.range?.start_message_id, "message-1");
      assert.equal(result.range?.end_message_id, "message-3");
      assert.equal(result.summary?.message_count, 3);
      assert.equal(state.listRoomSummaries("room-1").length, 0);
    });
  });

  it("commits a compact summary and continues from the last compacted message", () => {
    withState((state) => {
      for (let index = 1; index <= 7; index += 1) {
        state.addRoomMessage("room-1", makeMessage(index));
      }

      const first = state.compactRoom("room-1", { mode: "commit", keep_recent: 3 });
      assert.equal(first.status, "committed");
      assert.equal(first.range?.end_message_id, "message-4");
      assert.equal(state.listRoomSummaries("room-1").length, 1);

      const second = state.compactRoom("room-1", { mode: "commit", keep_recent: 2 });
      assert.equal(second.status, "committed");
      assert.equal(second.range?.start_message_id, "message-5");
      assert.equal(second.range?.end_message_id, "message-5");
      assert.equal(state.listRoomSummaries("room-1").length, 2);
    });
  });

  it("keeps full message history even when room max_history is small", () => {
    withState((state) => {
      for (let index = 1; index <= 5; index += 1) {
        state.addRoomMessage("room-1", makeMessage(index));
      }

      assert.equal(state.getRoom("room-1")?.messages.length, 2);

      const result = state.compactRoom("room-1", { keep_recent: 2 });
      assert.equal(result.range?.message_count, 3);
      assert.equal(result.summary?.summary.includes("第 1 条消息"), true);
    });
  });

  it("returns no-op for missing rooms or short histories", () => {
    withState((state) => {
      state.addRoomMessage("room-1", makeMessage(1));

      const short = state.compactRoom("room-1", { keep_recent: 2 });
      assert.equal(short.status, "no_op");

      assert.throws(() => state.compactRoom("missing"), /聊天室不存在/);
    });
  });
});
