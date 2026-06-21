import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { Message } from "@ai-party/shared";

import AppState from "../store";

function withState(run: (state: AppState) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-store-patch-"));
  process.env.DB_PATH = join(tempDir, "store.db");

  try {
    const state = new AppState();
    state.createRoom("Patch 测试房间", "", { id: "room-1" });
    run(state);
  } finally {
    delete process.env.DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeMessage(id: string, senderType: Message["sender_type"], content = "旧正文"): Message {
  return {
    id,
    character_id: senderType === "system" ? "system" : "char-1",
    character_name: senderType === "system" ? "旁白" : "角色一",
    content,
    timestamp: "2026-06-09T00:00:00.000Z",
    is_system: senderType === "system",
    sender_type: senderType,
    sender_user_id: senderType === "user" ? "user-1" : "agent",
  };
}

describe("AppState patchAgentRoomMessage", () => {
  it("patches an AI message and returns a patch payload", () => {
    withState((state) => {
      state.addRoomMessage("room-1", makeMessage("message-1", "ai"));

      const patch = state.patchAgentRoomMessage("room-1", {
        message_id: "message-1",
        content: "新正文",
        reason: "去重",
      });

      assert.equal(patch.room_id, "room-1");
      assert.equal(patch.message_id, "message-1");
      assert.equal(patch.content, "新正文");
      assert.equal(patch.reason, "去重");
      assert.match(patch.patched_at, /^20\d\d-/);
      assert.equal(state.getMessagesSince("room-1").find((item) => item.id === "message-1")?.content, "新正文");
    });
  });

  it("patches a system narrator message", () => {
    withState((state) => {
      state.addRoomMessage("room-1", makeMessage("message-1", "system"));

      const patch = state.patchAgentRoomMessage("room-1", {
        message_id: "message-1",
        content: "夜色更深。",
      });

      assert.equal(patch.content, "夜色更深。");
    });
  });

  it("rejects user messages and missing messages", () => {
    withState((state) => {
      state.addRoomMessage("room-1", makeMessage("message-1", "user"));

      assert.throws(
        () => state.patchAgentRoomMessage("room-1", { message_id: "message-1", content: "新正文" }),
        /不能修改用户消息/,
      );
      assert.throws(
        () => state.patchAgentRoomMessage("room-1", { message_id: "missing", content: "新正文" }),
        /消息不存在/,
      );
    });
  });
});
