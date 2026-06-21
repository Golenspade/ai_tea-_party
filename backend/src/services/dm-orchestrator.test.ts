import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Character, ChatRoom, Message } from "@ai-party/shared";

import { chooseNextSpeaker } from "./dm-orchestrator";

const alpha: Character = {
  id: "alpha",
  name: "Alpha",
  personality: "",
  background: "",
  is_active: true,
};

const beta: Character = {
  ...alpha,
  id: "beta",
  name: "Beta",
};

const inactive: Character = {
  ...alpha,
  id: "inactive",
  name: "Inactive",
  is_active: false,
};

function makeRoom(messages: Message[] = [], characters: Character[] = [alpha, beta, inactive]): ChatRoom {
  return {
    id: "room-1",
    name: "测试房间",
    description: "",
    characters,
    messages,
    is_auto_chat: false,
    max_history: 50,
    created_at: "2026-06-09T00:00:00.000Z",
    stealth_mode: false,
    user_description: "",
  };
}

function makeAiMessage(character: Character): Message {
  return {
    id: `message-${character.id}`,
    character_id: character.id,
    character_name: character.name,
    content: "正文",
    timestamp: "2026-06-09T00:00:00.000Z",
    is_system: false,
    sender_type: "ai",
  };
}

describe("chooseNextSpeaker", () => {
  it("uses a valid user-designated speaker first", () => {
    const choice = chooseNextSpeaker(makeRoom(), "beta");

    assert.equal(choice?.character.id, "beta");
    assert.equal(choice?.source, "user");
  });

  it("falls back to DM rotation when the designation is missing or inactive", () => {
    const choice = chooseNextSpeaker(makeRoom([makeAiMessage(alpha)]), "inactive");

    assert.equal(choice?.character.id, "beta");
    assert.equal(choice?.source, "dm");
  });

  it("chooses the first active character when there is no prior AI speaker", () => {
    const choice = chooseNextSpeaker(makeRoom());

    assert.equal(choice?.character.id, "alpha");
  });

  it("returns undefined when no active characters exist", () => {
    assert.equal(chooseNextSpeaker(makeRoom([], [inactive])), undefined);
  });
});
