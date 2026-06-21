import type {
  Character,
  ChatRoom,
  Message,
  Persona,
  BehaviorRule,
  RoomSummary,
  WorldInfoBook,
} from "@ai-party/shared";

import type { ResponseLength } from "../types";
import {
  WorldInfoScanner,
  buildWorldInfoScanText,
  type ScanResult,
} from "./world-info-scanner";
import { evaluateVariableConditions } from "./variable-conditions";

const DEFAULT_MAIN_PROMPT = `你正在参与一场多角色对话。你将扮演指定的角色，在对话中自然地回应。

- 始终保持角色的人格、语气和知识范围的一致性
- 像真人对话一样自然流畅地回应，避免机械感
- 不要重复其他角色刚说过的话或观点
- 对话中可以表达情感、提问、反驳或展开新话题
- 如果角色有独特的说话习惯或口癖，请自然地体现出来`;

const LENGTH_GUIDANCE: Record<ResponseLength, string> = {
  short: "[回复约束] 简洁回复，1-2句话即可，像微信聊天一样精炼。",
  default: "[回复约束] 自然回复，根据话题需要灵活调整长度，通常2-5句话。可以适当展开。",
  long: "[回复约束] 请充分展开你的想法，包含细节描述、故事、例子或深入分析。篇幅不限，鼓励深度表达。",
};

export const AGENT_TOOL_GUIDANCE = `[Agent 工具规则]
- write_to_room：剧情对白、角色发言、旁白（旁白使用 sender_type=system）。不要在 final 文本中重复已写入的内容。
- patch_room：修改已有 AI/旁白消息；必须提供目标 message_id 与修改后的完整正文，不要修改用户消息。
- write_to_bar：当前形势、场景摘要、地点/时间等外在状态（不要写入消息流）。
- ask_user：需要用户做剧情抉择时使用；提供 question 与 choices。
- 变量变更请使用 set_variable / inc_variable 等变量工具。`;

export const FOUR_BOOK_GUIDANCE = `[四书分层]
(a) 世界书：World Info 命中内容提供设定、规则和背景。
(b) 角色书/剧情书：角色字段、房间场景、当前目标和伏笔用于保持剧情连续。
(c) 行为书：工具规则与变量阈值决定可执行动作和分支后果。
(d) 当前交互内容：最近消息、状态栏和变量上下文代表本轮即时状态。`;

const MAX_VARIABLE_CONTEXT_ENTRIES = 80;
const MAX_VARIABLE_CONTEXT_TOTAL_CHARS = 4000;
const MAX_VARIABLE_CONTEXT_VALUE_CHARS = 120;
const MAX_SUMMARY_CONTEXT_ENTRIES = 12;
const MAX_SUMMARY_CONTEXT_CHARS = 6000;
const MAX_BEHAVIOR_RULE_ENTRIES = 20;
const MAX_BEHAVIOR_RULE_CHARS = 4000;

export interface SimplePromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AssembledPrompt {
  systemPrompt: string;
  messages: SimplePromptMessage[];
}

export interface PromptAssemblerInput {
  character: Character;
  room: ChatRoom;
  chatHistory?: Message[];
  persona?: Persona | null;
  worldInfoBooks?: WorldInfoBook[];
  summaries?: RoomSummary[];
  behaviorRules?: BehaviorRule[];
  roomScenario?: string;
  responseLength?: ResponseLength;
  variableContext?: {
    room: Record<string, unknown>;
    global: Record<string, unknown>;
  };
}

export function prepareChatHistoryForAi(room: ChatRoom, chatHistory: Message[]): Message[] {
  if (room.stealth_mode) {
    const aiCharacterIds = new Set(room.characters.map((item) => item.id));
    return chatHistory.filter((message) => {
      if (message.is_system) {
        return true;
      }
      if (aiCharacterIds.has(message.character_id)) {
        return true;
      }
      return message.sender_type === "ai";
    });
  }

  const userDescription = room.user_description?.trim();
  if (!userDescription) {
    return chatHistory;
  }

  return [
    {
      id: "room-user-description",
      character_id: "system",
      character_name: "系统",
      content: `用户信息：${userDescription}`,
      timestamp: new Date().toISOString(),
      is_system: true,
    },
    ...chatHistory,
  ];
}

export class PromptAssembler {
  private readonly scanner = new WorldInfoScanner();

  assemble(input: PromptAssemblerInput): AssembledPrompt {
    const {
      character,
      room,
      persona = null,
      worldInfoBooks = [],
      summaries = [],
      behaviorRules = [],
      roomScenario = room.description || "",
      responseLength = "default",
      variableContext = { room: {}, global: {} },
    } = input;

    const sourceHistory = input.chatHistory ?? room.messages;
    const visibleSummaries = room.stealth_mode ? [] : summaries;
    const compactedHistory = this.filterHistoryAfterLatestSummary(sourceHistory, visibleSummaries);
    const chatHistory = prepareChatHistoryForAi(room, compactedHistory);
    const activeBehaviorRules = this.filterActiveBehaviorRules(behaviorRules, variableContext);

    const scanResult = this.scanWorldInfo(
      character,
      persona,
      chatHistory,
      worldInfoBooks,
      room.user_description,
      visibleSummaries,
      variableContext,
    );
    const systemParts = this.collectSystemParts(
      character,
      persona,
      scanResult,
      roomScenario,
      responseLength,
      variableContext,
      visibleSummaries,
      activeBehaviorRules,
    );
    const messages = this.buildConversationMessages(character, chatHistory, scanResult);

    return {
      systemPrompt: systemParts.join("\n\n"),
      messages,
    };
  }

  private scanWorldInfo(
    character: Character,
    persona: Persona | null,
    chatHistory: Message[],
    books: WorldInfoBook[],
    userDescription: string,
    summaries: RoomSummary[],
    variableContext: { room: Record<string, unknown>; global: Record<string, unknown> },
  ): ScanResult {
    if (books.length === 0) {
      return this.scanner.scan([], "", { variableContext });
    }

    const personaDescription = persona?.description || userDescription || "";
    const summaryText = summaries.map((summary) => summary.summary).join("\n");
    const scanText = [
      buildWorldInfoScanText(character, chatHistory, personaDescription),
      summaryText,
    ].filter(Boolean).join("\n");
    return this.scanner.scan(books, scanText, { variableContext });
  }

  private collectSystemParts(
    character: Character,
    persona: Persona | null,
    scanResult: ScanResult,
    roomScenario: string,
    responseLength: ResponseLength,
    variableContext: { room: Record<string, unknown>; global: Record<string, unknown> },
    summaries: RoomSummary[],
    behaviorRules: BehaviorRule[],
  ): string[] {
    const parts: string[] = [];

    for (const activated of scanResult.system_top) {
      parts.push(activated.entry.content);
    }

    parts.push(character.system_prompt_override?.trim() || DEFAULT_MAIN_PROMPT);

    for (const activated of scanResult.before_char) {
      parts.push(activated.entry.content);
    }

    const descriptionParts = [`你是${character.name}。`];
    if (character.description) {
      descriptionParts.push(`角色描述：${character.description}`);
    }
    descriptionParts.push(`背景故事：${character.background}`);
    parts.push(descriptionParts.join("\n"));

    if (character.personality) {
      parts.push(`性格特点：${character.personality}`);
    }

    const scenario = character.scenario || roomScenario;
    if (scenario) {
      parts.push(`场景设定：${scenario}`);
    }

    for (const activated of scanResult.after_char) {
      parts.push(activated.entry.content);
    }

    if (persona?.description) {
      parts.push(`用户信息：${persona.name} — ${persona.description}`);
    }

    if (character.speaking_style) {
      parts.push(`说话风格：${character.speaking_style}`);
    }

    if (character.post_instructions) {
      parts.push(character.post_instructions);
    }

    const renderedSummaries = this.formatSummaries(summaries);
    if (renderedSummaries) {
      parts.push(renderedSummaries);
    }

    parts.push(FOUR_BOOK_GUIDANCE);

    const renderedBehaviorRules = this.formatBehaviorRules(behaviorRules);
    if (renderedBehaviorRules) {
      parts.push(renderedBehaviorRules);
    }

    const renderedVariables = this.formatVariableContext(variableContext);
    if (renderedVariables) {
      parts.push(renderedVariables);
    }

    const lengthText = LENGTH_GUIDANCE[responseLength] || LENGTH_GUIDANCE.default;
    parts.push(`${lengthText}\n\n请以${character.name}的身份自然回复：`);
    parts.push(AGENT_TOOL_GUIDANCE);

    for (const activated of scanResult.system_bottom) {
      parts.push(activated.entry.content);
    }

    return parts.filter(Boolean);
  }

  private filterHistoryAfterLatestSummary(chatHistory: Message[], summaries: RoomSummary[]): Message[] {
    const latest = [...summaries].sort((left, right) => {
      const byDate = left.created_at.localeCompare(right.created_at);
      if (byDate !== 0) {
        return byDate;
      }
      return left.id.localeCompare(right.id);
    }).at(-1);

    if (!latest) {
      return chatHistory;
    }

    const endIndex = chatHistory.findIndex((message) => message.id === latest.end_message_id);
    if (endIndex < 0) {
      return chatHistory;
    }
    return chatHistory.slice(endIndex + 1);
  }

  private buildConversationMessages(
    character: Character,
    chatHistory: Message[],
    scanResult: ScanResult,
  ): SimplePromptMessage[] {
    const messages: SimplePromptMessage[] = [];

    for (const activated of scanResult.before_examples) {
      messages.push({ role: "system", content: activated.entry.content });
    }

    for (const example of character.example_dialogues || []) {
      messages.push({
        role: "user",
        content: `[示例] ${example.user_message}`,
      });
      messages.push({
        role: "assistant",
        content: example.character_response,
      });
    }

    for (const activated of scanResult.after_examples) {
      messages.push({ role: "system", content: activated.entry.content });
    }

    const recent = chatHistory
      .filter((message) => !message.is_system && message.content.trim().length > 0)
      .slice(-25);
    const depthEntries = new Map<number, string>();
    for (const activated of scanResult.at_depth) {
      depthEntries.set(activated.entry.depth, activated.entry.content);
    }

    for (let index = 0; index < recent.length; index += 1) {
      const depthFromEnd = recent.length - index;
      const depthContent = depthEntries.get(depthFromEnd);
      if (depthContent) {
        messages.push({ role: "system", content: depthContent });
      }

      const message = recent[index];
      if (message.character_id === character.id || message.sender_type === "ai") {
        messages.push({
          role: "assistant",
          content: message.content,
        });
        continue;
      }

      messages.push({
        role: "user",
        content: `[${message.character_name}]: ${message.content}`,
      });
    }

    return messages;
  }

  private filterActiveBehaviorRules(
    rules: BehaviorRule[],
    variableContext: { room: Record<string, unknown>; global: Record<string, unknown> },
  ): BehaviorRule[] {
    return rules
      .filter((rule) => rule.enabled)
      .filter((rule) =>
        evaluateVariableConditions(
          rule.conditions,
          rule.condition_logic,
          variableContext,
        ))
      .sort((left, right) => left.priority - right.priority);
  }

  private formatBehaviorRules(rules: BehaviorRule[]): string {
    if (rules.length === 0) {
      return "";
    }

    const lines = ["[行为书命中规则]"];
    let chars = lines[0].length;

    for (const rule of rules.slice(0, MAX_BEHAVIOR_RULE_ENTRIES)) {
      const content = rule.prompt_text.trim();
      if (!content) {
        continue;
      }

      const rendered = `- ${rule.name}：${content}`;
      if (chars + rendered.length > MAX_BEHAVIOR_RULE_CHARS && lines.length > 1) {
        lines.push("...（行为书规则已截断）");
        break;
      }

      lines.push(rendered);
      chars += rendered.length;
    }

    return lines.length > 1 ? lines.join("\n") : "";
  }

  private formatVariableContext(variableContext: {
    room: Record<string, unknown>;
    global: Record<string, unknown>;
  }): string {
    const lines = [
      "[变量上下文 / 行为书分支信号]",
      "变量可作为剧情分支条件；当数值、状态或阈值暗示后果时，请在行动与叙事中体现。",
    ];
    let emitted = 0;
    let truncated = false;

    const emitScope = (scope: "room" | "global", values: Record<string, unknown>): boolean => {
      for (const name of Object.keys(values).sort()) {
        if (emitted >= MAX_VARIABLE_CONTEXT_ENTRIES) {
          return true;
        }

        const rendered = this.formatVariableValue(values[name], MAX_VARIABLE_CONTEXT_VALUE_CHARS);
        const candidate = [...lines, `${scope}.${name} = ${rendered}`];
        if (
          candidate.join("\n").length > MAX_VARIABLE_CONTEXT_TOTAL_CHARS &&
          emitted > 0
        ) {
          return true;
        }

        lines.push(`${scope}.${name} = ${rendered}`);
        emitted += 1;
      }
      return false;
    };

    truncated = emitScope("room", variableContext.room);
    if (!truncated) {
      truncated = emitScope("global", variableContext.global);
    }

    if (truncated && emitted > 0) {
      lines.push("...（变量上下文已截断）");
    }

    return emitted > 0 ? lines.join("\n") : "";
  }

  private formatSummaries(summaries: RoomSummary[]): string {
    if (summaries.length === 0) {
      return "";
    }

    const lines = ["[历史摘要 / Compact]"];
    let chars = lines[0].length;
    for (const summary of summaries.slice(-MAX_SUMMARY_CONTEXT_ENTRIES)) {
      const header = `- ${summary.created_at} (${summary.message_count} 条, ${summary.start_message_id} -> ${summary.end_message_id}, ${summary.source})`;
      const body = summary.summary.trim();
      const next = `${header}\n${body}`;
      if (chars + next.length > MAX_SUMMARY_CONTEXT_CHARS && lines.length > 1) {
        lines.push("...（历史摘要已截断）");
        break;
      }
      lines.push(next);
      chars += next.length;
    }

    return lines.length > 1 ? lines.join("\n") : "";
  }

  private formatVariableValue(value: unknown, maxChars: number): string {
    let rendered: string;
    try {
      rendered = JSON.stringify(value);
    } catch {
      rendered = String(value);
    }

    if (rendered.length > maxChars) {
      return `${rendered.slice(0, maxChars - 3)}...`;
    }
    return rendered;
  }
}
