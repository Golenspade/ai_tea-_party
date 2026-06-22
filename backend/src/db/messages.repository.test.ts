import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { Message } from "@ai-party/shared";

import { AppRepository } from "./repository";

function withRepository(run: (repository: AppRepository) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-messages-"));
  process.env.DB_PATH = join(tempDir, "messages.db");

  try {
    const repository = new AppRepository();
    repository.createRoom("room-1", "测试房间");
    repository.createRoom("room-2", "其他房间");
    run(repository);
  } finally {
    delete process.env.DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeMessage(id: string, content: string, senderType: Message["sender_type"] = "ai"): Message {
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

describe("AppRepository messages", () => {
  it("updates message content while preserving metadata", () => {
    withRepository((repository) => {
      repository.addRoomMessage("room-1", makeMessage("message-1", "旧正文"));

      const updated = repository.updateRoomMessageContent("room-1", "message-1", "新正文");

      assert.equal(updated?.content, "新正文");
      assert.equal(updated?.character_id, "char-1");
      assert.equal(updated?.timestamp, "2026-06-09T00:00:00.000Z");
      assert.equal(repository.getRoomMessage("room-1", "message-1")?.content, "新正文");
    });
  });

  it("does not update messages from another room", () => {
    withRepository((repository) => {
      repository.addRoomMessage("room-1", makeMessage("message-1", "旧正文"));

      const updated = repository.updateRoomMessageContent("room-2", "message-1", "新正文");

      assert.equal(updated, undefined);
      assert.equal(repository.getRoomMessage("room-1", "message-1")?.content, "旧正文");
    });
  });

  it("returns undefined for missing messages", () => {
    withRepository((repository) => {
      assert.equal(repository.getRoomMessage("room-1", "missing"), undefined);
      assert.equal(repository.updateRoomMessageContent("room-1", "missing", "新正文"), undefined);
    });
  });

  it("returns the latest messages in chronological order when no since cursor", () => {
    withRepository((repository) => {
      for (let index = 0; index < 5; index += 1) {
        repository.addRoomMessage("room-1", {
          ...makeMessage(`message-${index}`, `正文-${index}`, "ai"),
          timestamp: `2026-06-09T00:00:0${index}.000Z`,
        });
      }

      const latestTwo = repository.getRoomMessages("room-1", undefined, 2);
      assert.equal(latestTwo.length, 2);
      assert.equal(latestTwo[0]?.id, "message-3");
      assert.equal(latestTwo[1]?.id, "message-4");
    });
  });
});
