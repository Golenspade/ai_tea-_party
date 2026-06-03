import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Character } from "@ai-party/shared";

import { buildWriteToRoomMessage, parseWriteToRoomInput } from "./write-to-room";

const speaker: Character = {
  id: "char-a",
  name: "小明",
  personality: "",
  background: "",
  is_active: true,
};

const other: Character = {
  id: "char-b",
  name: "李博士",
  personality: "",
  background: "",
  is_active: true,
};

describe("write-to-room", () => {
  it("parses write_to_room args", () => {
    const parsed = parseWriteToRoomInput({
      content: "  你好  ",
      character_id: "char-b",
      sender_type: "ai",
    });

    assert.equal(parsed.content, "你好");
    assert.equal(parsed.character_id, "char-b");
    assert.equal(parsed.sender_type, "ai");
  });

  it("builds ai message for speaking character by default", () => {
    const message = buildWriteToRoomMessage(
      { content: "大家好" },
      {
        roomId: "room-1",
        speakingCharacter: speaker,
        characters: [speaker, other],
        now: () => "2026-06-03T00:00:00.000Z",
      },
    );

    assert.equal(message.character_id, "char-a");
    assert.equal(message.character_name, "小明");
    assert.equal(message.sender_type, "ai");
    assert.equal(message.content, "大家好");
  });

  it("builds narrator message for system sender_type", () => {
    const message = buildWriteToRoomMessage(
      { content: "夜风渐起。", sender_type: "system" },
      {
        roomId: "room-1",
        speakingCharacter: speaker,
        characters: [speaker],
      },
    );

    assert.equal(message.character_id, "system");
    assert.equal(message.character_name, "旁白");
    assert.equal(message.is_system, true);
    assert.equal(message.sender_type, "system");
  });

  it("rejects unknown character_id", () => {
    assert.throws(
      () =>
        buildWriteToRoomMessage(
          { content: "test", character_id: "missing" },
          {
            roomId: "room-1",
            speakingCharacter: speaker,
            characters: [speaker],
          },
        ),
      /角色不存在/,
    );
  });
});
