import type { Character, ChatRoom, Message, Persona, WorldInfoBook } from "@ai-party/shared";

import type { ResponseLength } from "../types";
import {
  WorldInfoScanner,
  buildWorldInfoScanText,
  type ScanResult,
} from "./world-info-scanner";

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

const MAX_VARIABLE_CONTEXT_ENTRIES = 80;
const MAX_VARIABLE_CONTEXT_TOTAL_CHARS = 4000;
const MAX_VARIABLE_CONTEXT_VALUE_CHARS = 120;

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
      roomScenario = room.description || "",
      responseLength = "default",
      variableContext = { room: {}, global: {} },
    } = input;

    const sourceHistory = input.chatHistory ?? room.messages;
    const chatHistory = prepareChatHistoryForAi(room, sourceHistory);

    const scanResult = this.scanWorldInfo(character, persona, chatHistory, worldInfoBooks, room.user_description);
    const systemParts = this.collectSystemParts(
      character,
      persona,
      scanResult,
      roomScenario,
      responseLength,
      variableContext,
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
  ): ScanResult {
    if (books.length === 0) {
      return this.scanner.scan([], "");
    }

    const personaDescription = persona?.description || userDescription || "";
    const scanText = buildWorldInfoScanText(character, chatHistory, personaDescription);
    return this.scanner.scan(books, scanText);
  }

  private collectSystemParts(
    character: Character,
    persona: Persona | null,
    scanResult: ScanResult,
    roomScenario: string,
    responseLength: ResponseLength,
    variableContext: { room: Record<string, unknown>; global: Record<string, unknown> },
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

    const renderedVariables = this.formatVariableContext(variableContext);
    if (renderedVariables) {
      parts.push(renderedVariables);
    }

    const lengthText = LENGTH_GUIDANCE[responseLength] || LENGTH_GUIDANCE.default;
    parts.push(`${lengthText}\n\n请以${character.name}的身份自然回复：`);

    for (const activated of scanResult.system_bottom) {
      parts.push(activated.entry.content);
    }

    return parts.filter(Boolean);
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

  private formatVariableContext(variableContext: {
    room: Record<string, unknown>;
    global: Record<string, unknown>;
  }): string {
    const lines = ["[变量上下文]"];
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
          lines.length > 1
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

    if (truncated && lines.length > 1) {
      lines.push("...（变量上下文已截断）");
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
