import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Character, Message } from "@ai-party/shared";

import {
  analyzeConversationContext,
  buildSupplementalSystemMessages,
  CharacterMemory,
  getCharacterMemoryContext,
  updateCharacterMemoryFromHistory,
} from "./character-memory.js";

const baseCharacter = {
  id: "char-a",
  name: "茶室主持",
  personality: "",
  background: "",
  description: "",
  is_active: true,
} satisfies Character;

function message(partial: Partial<Message> & Pick<Message, "id" | "character_id" | "content">): Message {
  return {
    character_name: partial.character_name || "访客",
    timestamp: partial.timestamp || "2026-01-01T00:00:00.000Z",
    is_system: partial.is_system ?? false,
    sender_type: partial.sender_type,
    ...partial,
  };
}

describe("CharacterMemory", () => {
  it("learns traits from recent messages", () => {
    const memory = new CharacterMemory();
    const history: Message[] = [
      message({
        id: "m1",
        character_id: "char-b",
        character_name: "小明",
        content: "哈哈，今天真开心，谢谢大家的分享！",
      }),
    ];

    updateCharacterMemoryFromHistory(memory, history);
    const context = memory.getCharacterContext("char-b");

    assert.match(context, /小明/);
    assert.match(context, /幽默开朗/);
    assert.match(context, /礼貌/);
  });

  it("builds supplemental system messages for orchestrator", () => {
    const memory = new CharacterMemory();
    const history: Message[] = [
      message({
        id: "m1",
        character_id: "char-b",
        character_name: "小明",
        content: "你觉得今天怎么样？",
      }),
    ];

    updateCharacterMemoryFromHistory(memory, history);
    const supplemental = buildSupplementalSystemMessages(memory, baseCharacter, history);

    assert.equal(supplemental.length, 2);
    assert.match(supplemental[0]?.content || "", /角色记忆/);
    assert.match(supplemental[1]?.content || "", /对话情境分析/);
    assert.match(supplemental[1]?.content || "", /需要回答问题/);
  });

  it("falls back to recent quotes when profile is missing", () => {
    const memory = new CharacterMemory();
    const history: Message[] = [
      message({
        id: "m1",
        character_id: "char-b",
        character_name: "小明",
        content: "我刚从图书馆回来。",
      }),
    ];

    const context = getCharacterMemoryContext(memory, baseCharacter.id, history);
    assert.match(context, /小明最近说过/);
  });
});
