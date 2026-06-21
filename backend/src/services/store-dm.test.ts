import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { Character, Message } from "@ai-party/shared";

import AppState from "../store";

function withState(run: (state: AppState) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-store-dm-"));
  process.env.DB_PATH = join(tempDir, "store.db");

  try {
    const state = new AppState();
    state.createRoom("DM 测试房间", "", { id: "room-1" });
    state.addCharacterToRoom("room-1", makeCharacter("alpha", "Alpha"));
    state.addCharacterToRoom("room-1", makeCharacter("beta", "Beta"));
    run(state);
  } finally {
    delete process.env.DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeCharacter(id: string, name: string): Character {
  return {
    id,
    name,
    personality: "",
    background: "",
    is_active: true,
  };
}

function makeAiMessage(characterId: string, characterName: string): Message {
  return {
    id: `message-${characterId}`,
    character_id: characterId,
    character_name: characterName,
    content: "正文",
    timestamp: "2026-06-09T00:00:00.000Z",
    is_system: false,
    sender_type: "ai",
  };
}

describe("AppState DM speaker selection", () => {
  it("records and consumes a user-designated next speaker", () => {
    withState((state) => {
      const designated = state.designateNextSpeaker("room-1", "beta");
      assert.equal(designated.character_id, "beta");
      assert.equal(designated.source, "user");

      const consumed = state.chooseNextSpeaker("room-1");
      assert.equal(consumed?.character_id, "beta");
      assert.equal(consumed?.source, "user");

      const next = state.chooseNextSpeaker("room-1");
      assert.equal(next?.source, "dm");
    });
  });

  it("falls back to DM rotation after the last AI speaker", () => {
    withState((state) => {
      state.addRoomMessage("room-1", makeAiMessage("alpha", "Alpha"));

      const choice = state.chooseNextSpeaker("room-1");

      assert.equal(choice?.character_id, "beta");
      assert.equal(choice?.source, "dm");
    });
  });

  it("rejects invalid designations", () => {
    withState((state) => {
      assert.throws(() => state.designateNextSpeaker("missing-room", "alpha"), /聊天室不存在/);
      assert.throws(() => state.designateNextSpeaker("room-1", "missing"), /角色不存在/);
    });
  });
});
