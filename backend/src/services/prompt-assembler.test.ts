import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Character, WorldInfoBook } from "@ai-party/shared";

import { PromptAssembler, prepareChatHistoryForAi } from "./prompt-assembler.js";

describe("PromptAssembler", () => {
  it("assembles system prompt with WI and variable context", () => {
    const assembler = new PromptAssembler();
    const character = {
      id: "char-1",
      name: "茶室主持",
      personality: "温和",
      background: "资深主持人",
      description: "引导话题",
      is_active: true,
    } satisfies Character;

    const book: WorldInfoBook = {
      id: "book-1",
      name: "Test Lore",
      description: "",
      enabled: true,
      entries: [
        {
          id: "entry-1",
          keys: ["主持"],
          secondary_keys: [],
          selective_logic: "AND",
          content: "主持人在茶室负责控场。",
          position: "after_char",
          depth: 4,
          enabled: true,
          constant: false,
          order: 10,
        },
      ],
    };

    const assembled = assembler.assemble({
      character,
      room: {
        id: "default",
        name: "默认聊天室",
        description: "测试房间",
        characters: [character],
        messages: [
          {
            id: "m1",
            character_id: "user",
            character_name: "访客",
            content: "今天请主持开场",
            timestamp: "2026-01-01T00:00:00.000Z",
            is_system: false,
            sender_type: "user",
          },
        ],
        is_auto_chat: false,
        max_history: 50,
        created_at: "2026-01-01T00:00:00.000Z",
        stealth_mode: false,
        user_description: "",
      },
      worldInfoBooks: [book],
      variableContext: {
        room: { mood: "calm" },
        global: {},
      },
    });

    assert.match(assembled.systemPrompt, /茶室主持/);
    assert.match(assembled.systemPrompt, /主持人在茶室负责控场/);
    assert.match(assembled.systemPrompt, /room\.mood = "calm"/);
    assert.ok(assembled.messages.some((message) => message.role === "user"));
  });

  it("filters user messages in stealth mode", () => {
    const character = {
      id: "char-ai",
      name: "茶室主持",
      personality: "温和",
      background: "",
      description: "",
      is_active: true,
    } satisfies Character;

    const room = {
      id: "default",
      name: "默认",
      description: "",
      characters: [character],
      messages: [],
      is_auto_chat: false,
      max_history: 50,
      created_at: "2026-01-01T00:00:00.000Z",
      stealth_mode: true,
      user_description: "",
    };

    const history = [
      {
        id: "m-user",
        character_id: "user",
        character_name: "访客",
        content: "用户不应被 AI 看到",
        timestamp: "2026-01-01T00:00:00.000Z",
        is_system: false,
        sender_type: "user" as const,
      },
      {
        id: "m-ai",
        character_id: "char-ai",
        character_name: "茶室主持",
        content: "AI 可见",
        timestamp: "2026-01-01T00:00:01.000Z",
        is_system: false,
        sender_type: "ai" as const,
      },
    ];

    const filtered = prepareChatHistoryForAi(room, history);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.content, "AI 可见");
  });

  it("prepends user description when not in stealth mode", () => {
    const filtered = prepareChatHistoryForAi(
      {
        id: "default",
        name: "默认",
        description: "",
        characters: [],
        messages: [],
        is_auto_chat: false,
        max_history: 50,
        created_at: "2026-01-01T00:00:00.000Z",
        stealth_mode: false,
        user_description: "喜欢科幻",
      },
      [],
    );

    assert.equal(filtered.length, 1);
    assert.match(filtered[0]?.content || "", /喜欢科幻/);
  });
});
