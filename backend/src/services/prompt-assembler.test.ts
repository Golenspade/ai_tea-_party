import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BehaviorRule, Character, RoomSummary, WorldInfoBook } from "@ai-party/shared";

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
    assert.match(assembled.systemPrompt, /\[四书分层\]/);
    assert.match(assembled.systemPrompt, /行为书：工具规则与变量阈值决定可执行动作和分支后果/);
    assert.match(assembled.systemPrompt, /\[变量上下文 \/ 行为书分支信号\]/);
    assert.match(assembled.systemPrompt, /room\.mood = "calm"/);
    assert.ok(assembled.messages.some((message) => message.role === "user"));
  });

  it("renders variable branch signals across room and global scopes", () => {
    const assembler = new PromptAssembler();
    const character = {
      id: "char-branch",
      name: "分支主持",
      personality: "谨慎",
      background: "负责观察变量",
      description: "",
      is_active: true,
    } satisfies Character;

    const assembled = assembler.assemble({
      character,
      room: {
        id: "default",
        name: "默认聊天室",
        description: "",
        characters: [character],
        messages: [],
        is_auto_chat: false,
        max_history: 50,
        created_at: "2026-01-01T00:00:00.000Z",
        stealth_mode: false,
        user_description: "",
      },
      variableContext: {
        room: {
          danger: 8,
          favor: 2,
        },
        global: {
          chapter: "phase-2",
        },
      },
    });

    assert.match(assembled.systemPrompt, /变量可作为剧情分支条件/);
    assert.match(assembled.systemPrompt, /room\.danger = 8/);
    assert.match(assembled.systemPrompt, /room\.favor = 2/);
    assert.match(assembled.systemPrompt, /global\.chapter = "phase-2"/);
  });

  it("uses variable conditions to gate WorldInfo in the final system prompt", () => {
    const assembler = new PromptAssembler();
    const character = {
      id: "char-conditional",
      name: "条件主持",
      personality: "敏锐",
      background: "观察局势",
      description: "",
      is_active: true,
    } satisfies Character;
    const book: WorldInfoBook = {
      id: "book-conditions",
      name: "Conditional Lore",
      description: "",
      enabled: true,
      entries: [
        {
          id: "entry-open",
          keys: ["密室"],
          secondary_keys: [],
          selective_logic: "AND",
          content: "危险值足够时，密室门会打开。",
          position: "after_char",
          depth: 4,
          enabled: true,
          constant: false,
          order: 10,
          conditions: [{ scope: "room", name: "danger", op: "gte", value: 5 }],
          condition_logic: "AND",
        },
      ],
    };
    const room = {
      id: "default",
      name: "默认聊天室",
      description: "",
      characters: [character],
      messages: [
        {
          id: "m1",
          character_id: "user",
          character_name: "访客",
          content: "检查密室",
          timestamp: "2026-01-01T00:00:00.000Z",
          is_system: false,
          sender_type: "user" as const,
        },
      ],
      is_auto_chat: false,
      max_history: 50,
      created_at: "2026-01-01T00:00:00.000Z",
      stealth_mode: false,
      user_description: "",
    };

    const blocked = assembler.assemble({
      character,
      room,
      worldInfoBooks: [book],
      variableContext: { room: { danger: 3 }, global: {} },
    });
    const allowed = assembler.assemble({
      character,
      room,
      worldInfoBooks: [book],
      variableContext: { room: { danger: 6 }, global: {} },
    });

    assert.doesNotMatch(blocked.systemPrompt, /密室门会打开/);
    assert.match(allowed.systemPrompt, /密室门会打开/);
  });

  it("injects only active behavior rules into the system prompt", () => {
    const assembler = new PromptAssembler();
    const character = {
      id: "char-behavior",
      name: "行为主持",
      personality: "冷静",
      background: "执行行为书",
      description: "",
      is_active: true,
    } satisfies Character;
    const rules: BehaviorRule[] = [
      {
        id: "rule-active",
        room_id: "default",
        name: "高风险",
        enabled: true,
        priority: 10,
        conditions: [{ scope: "room", name: "danger", op: "gte", value: 8 }],
        condition_logic: "AND",
        prompt_text: "进入高风险叙事，角色应优先自保并减少玩笑。",
        created_at: "2026-06-09T00:00:00.000Z",
        updated_at: "2026-06-09T00:00:00.000Z",
      },
      {
        id: "rule-blocked",
        room_id: "default",
        name: "低风险",
        enabled: true,
        priority: 20,
        conditions: [{ scope: "room", name: "danger", op: "lt", value: 3 }],
        condition_logic: "AND",
        prompt_text: "这条不应该出现。",
        created_at: "2026-06-09T00:00:00.000Z",
        updated_at: "2026-06-09T00:00:00.000Z",
      },
    ];

    const assembled = assembler.assemble({
      character,
      room: {
        id: "default",
        name: "默认聊天室",
        description: "",
        characters: [character],
        messages: [],
        is_auto_chat: false,
        max_history: 50,
        created_at: "2026-01-01T00:00:00.000Z",
        stealth_mode: false,
        user_description: "",
      },
      behaviorRules: rules,
      variableContext: { room: { danger: 9 }, global: {} },
      variableDisplays: [
        {
          name: "danger",
          label: "危险",
          hint: "场景危险程度；明显危机时上升",
        },
      ],
    });

    assert.match(assembled.systemPrompt, /房间状态变量/);
    assert.match(assembled.systemPrompt, /danger（危险）：场景危险程度/);
    assert.match(assembled.systemPrompt, /\[行为书命中规则\]/);
    assert.match(assembled.systemPrompt, /高风险：进入高风险叙事/);
    assert.doesNotMatch(assembled.systemPrompt, /这条不应该出现/);
  });

  it("omits variable context when no variables are available", () => {
    const assembler = new PromptAssembler();
    const character = {
      id: "char-empty-vars",
      name: "空变量主持",
      personality: "",
      background: "",
      description: "",
      is_active: true,
    } satisfies Character;

    const assembled = assembler.assemble({
      character,
      room: {
        id: "default",
        name: "默认聊天室",
        description: "",
        characters: [character],
        messages: [],
        is_auto_chat: false,
        max_history: 50,
        created_at: "2026-01-01T00:00:00.000Z",
        stealth_mode: false,
        user_description: "",
      },
      variableContext: {
        room: {},
        global: {},
      },
    });

    assert.match(assembled.systemPrompt, /\[四书分层\]/);
    assert.doesNotMatch(assembled.systemPrompt, /\[变量上下文 \/ 行为书分支信号\]/);
  });

  it("adds compact summaries and omits compacted messages from conversation context", () => {
    const assembler = new PromptAssembler();
    const character = {
      id: "char-ai",
      name: "茶室主持",
      personality: "温和",
      background: "主持茶话会",
      description: "",
      is_active: true,
    } satisfies Character;
    const summary: RoomSummary = {
      id: "summary-1",
      room_id: "default",
      start_message_id: "m1",
      end_message_id: "m2",
      message_count: 2,
      summary: "用户提出旧问题，主持已经解释过旧设定。",
      source: "deterministic",
      created_at: "2026-06-09T00:01:00.000Z",
    };

    const assembled = assembler.assemble({
      character,
      summaries: [summary],
      room: {
        id: "default",
        name: "默认聊天室",
        description: "",
        characters: [character],
        messages: [
          {
            id: "m1",
            character_id: "user",
            character_name: "访客",
            content: "旧问题",
            timestamp: "2026-06-09T00:00:00.000Z",
            is_system: false,
            sender_type: "user",
          },
          {
            id: "m2",
            character_id: "char-ai",
            character_name: "茶室主持",
            content: "旧回答",
            timestamp: "2026-06-09T00:00:01.000Z",
            is_system: false,
            sender_type: "ai",
          },
          {
            id: "m3",
            character_id: "user",
            character_name: "访客",
            content: "新问题",
            timestamp: "2026-06-09T00:00:02.000Z",
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
    });

    assert.match(assembled.systemPrompt, /\[历史摘要 \/ Compact\]/);
    assert.match(assembled.systemPrompt, /主持已经解释过旧设定/);
    assert.equal(assembled.messages.some((message) => message.content.includes("旧问题")), false);
    assert.equal(assembled.messages.some((message) => message.content.includes("旧回答")), false);
    assert.equal(assembled.messages.some((message) => message.content.includes("新问题")), true);
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
