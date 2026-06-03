import { randomBytes, randomUUID } from "node:crypto";

import { Agent } from "@earendil-works/pi-agent-core";
import { Type, getModel } from "@earendil-works/pi-ai";
import type { Character, ChatRoom, StreamingEvent } from "@ai-party/shared";

import type { ResponseLength } from "./types";

export interface OrchestratorStreamSession {
  requestId: string;
  messageId: string;
  characterId: string;
  characterName: string;
  events: AsyncGenerator<StreamingEvent>;
}

export type VariableScope = "room" | "global";

export interface VariableEntryLike {
  name: string;
  value: unknown;
}

export interface OrchestratorRuntime {
  roomId: string;
  provider: string;
  model: string;
  listRoomVariables: (roomId: string) => Promise<VariableEntryLike[]> | VariableEntryLike[];
  listGlobalVariables: () => Promise<VariableEntryLike[]> | VariableEntryLike[];
  setVariable: (scope: VariableScope, name: string, value: unknown) => Promise<VariableEntryLike> | VariableEntryLike;
  addVariable: (scope: VariableScope, name: string, value: unknown) => Promise<VariableEntryLike> | VariableEntryLike;
  incVariable: (scope: VariableScope, name: string, value: unknown) => Promise<VariableEntryLike> | VariableEntryLike;
  decVariable: (scope: VariableScope, name: string, value: unknown) => Promise<VariableEntryLike> | VariableEntryLike;
}

interface StreamContext {
  requestId: string;
  messageId: string;
  characterId: string;
  characterName: string;
}

interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
  terminate?: boolean;
}

interface SimpleMessage {
  role: string;
  content: string;
}

const PROVIDER_MAP: Record<string, string> = {
  openai: "openai",
  deepseek: "deepseek",
  gemini: "google",
  xai: "xai",
  minimax: "minimax",
  moonshot: "moonshot",
};

const LENGTH_GUIDANCE: Record<ResponseLength, string> = {
  short: "[回复约束] 简洁回复，1-2句话。",
  default: "[回复约束] 自然回复，通常2-5句。",
  long: "[回复约束] 充分展开，适度丰富细节。",
};

class AsyncStreamingQueue<T> {
  private readonly values: T[] = [];
  private readonly waits: Array<(value: IteratorResult<T>) => void> = [];
  private isClosed = false;

  push(value: T): void {
    if (this.isClosed) {
      return;
    }

    const waiter = this.waits.shift();
    if (waiter) {
      waiter({ done: false, value });
      return;
    }

    this.values.push(value);
  }

  close(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    const done: IteratorResult<T> = { done: true, value: undefined as T };
    while (this.waits.length > 0) {
      this.waits.shift()!(done);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length > 0) {
          return Promise.resolve({ value: this.values.shift()!, done: false });
        }

        if (this.isClosed) {
          return Promise.resolve({ done: true, value: undefined as T });
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.waits.push(resolve);
        });
      },
    };
  }
}

interface AgentEventLike {
  type?: string;
  assistantMessageEvent?: { type?: string; delta?: string };
  toolCallId?: string;
  toolCall?: { name?: string; arguments?: Record<string, unknown> };
  arguments?: Record<string, unknown>;
  args?: Record<string, unknown>;
  toolName?: string;
  result?: { content?: unknown; details?: Record<string, unknown> };
  partialResult?: { content?: unknown; details?: Record<string, unknown> } | Record<string, unknown>;
  error?: string;
  messages?: unknown[];
}

function normalizeToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  if (raw instanceof Map) {
    return Object.fromEntries(raw) as Record<string, unknown>;
  }

  return raw as Record<string, unknown>;
}

function normalizeVariableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }

      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }

      return "";
    })
    .join("");
}

function stripCharacterPrefix(content: string, characterName: string): string {
  const prefix = `${characterName}:`;
  if (content.startsWith(prefix)) {
    return content.slice(prefix.length).trim();
  }

  return content;
}

async function entriesToRecord(
  values: Promise<VariableEntryLike[]> | VariableEntryLike[],
): Promise<Record<string, unknown>> {
  const rows = await Promise.resolve(values);
  const map: Record<string, unknown> = {};

  for (const entry of rows || []) {
    if (entry && typeof entry.name === "string") {
      map[entry.name] = entry.value;
    }
  }

  return map;
}

export class ChatOrchestrator {
  async generateReply(
    room: ChatRoom,
    character: Character,
    responseLength: ResponseLength,
    runtime: OrchestratorRuntime,
  ): Promise<{ requestId: string; messageId: string; content: string }> {
    const session = await this.generateReplyStream(room, character, responseLength, runtime);
    let content = "";

    for await (const event of session.events) {
      if (event.type === "final") {
        content = event.content;
      }
    }

    return {
      requestId: session.requestId,
      messageId: session.messageId,
      content,
    };
  }

  async generateReplyStream(
    room: ChatRoom,
    character: Character,
    responseLength: ResponseLength,
    runtime: OrchestratorRuntime,
  ): Promise<OrchestratorStreamSession> {
    const requestId = randomBytes(8).toString("hex");
    const messageId = randomUUID();

    const events = this.streamEvents(
      {
        requestId,
        messageId,
        characterId: character.id,
        characterName: character.name,
      },
      room,
      character,
      responseLength,
      runtime,
    );

    return {
      requestId,
      messageId,
      characterId: character.id,
      characterName: character.name,
      events,
    };
  }

  private async *streamEvents(
    runContext: StreamContext,
    room: ChatRoom,
    character: Character,
    responseLength: ResponseLength,
    runtime: OrchestratorRuntime,
  ): AsyncGenerator<StreamingEvent> {
    const queue = new AsyncStreamingQueue<StreamingEvent>();
    const tools = this.createTools(runtime);
    let model: unknown;
    let finalSent = false;

    try {
      model = getModel(PROVIDER_MAP[runtime.provider] || runtime.provider, runtime.model);
    } catch (error) {
      queue.push({
        type: "error",
        request_id: runContext.requestId,
        message_id: runContext.messageId,
        character_id: runContext.characterId,
        message: error instanceof Error ? error.message : "模型初始化失败",
      });
      queue.close();
      yield* queue;
      return;
    }

    const variableContext = {
      room: await entriesToRecord(runtime.listRoomVariables(runtime.roomId)),
      global: await entriesToRecord(runtime.listGlobalVariables()),
    };

    const baseMessages = this.buildConversationMessages(room);
    const systemPrompt = this.composeSystemPrompt(character, room, responseLength, variableContext);

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        messages: baseMessages,
      },
      beforeToolCall: async ({ toolCall, args }) => {
        if (process.env.NODE_ENV !== "production") {
          console.info(`beforeToolCall: ${toolCall.name} ${JSON.stringify(args)}`);
        }
      },
      afterToolCall: async ({ toolCall, result }) => {
        if (process.env.NODE_ENV !== "production") {
          console.info(`afterToolCall: ${toolCall.name} ${JSON.stringify(result?.details ?? result)}`);
        }
      },
    });

    const unsubscribe = agent.subscribe(async (event: unknown) => {
      const payload = event as AgentEventLike;
      if (!payload?.type) {
        return;
      }

      switch (payload.type) {
        case "message_update": {
          const assistantEvent = payload.assistantMessageEvent;
          if (assistantEvent?.type === "text_delta" && typeof assistantEvent.delta === "string") {
            queue.push({
              type: "delta",
              request_id: runContext.requestId,
              message_id: runContext.messageId,
              character_id: runContext.characterId,
              character_name: runContext.characterName,
              content: assistantEvent.delta,
            });
          }
          break;
        }

        case "tool_execution_start": {
          const toolName =
            payload.toolName ||
            payload.toolCall?.name ||
            payload.toolCallId ||
            "tool";
          queue.push({
            type: "tool_call_start",
            request_id: runContext.requestId,
            tool: toolName,
            args: normalizeToolArgs(payload.args || payload.toolCall?.arguments),
          });
          break;
        }

        case "tool_execution_update": {
          const toolName = payload.toolName || payload.toolCall?.name || payload.toolCallId || "tool";
          const partial = (payload.partialResult as { content?: unknown } | undefined)?.content;
          queue.push({
            type: "tool_call_update",
            request_id: runContext.requestId,
            tool: toolName,
            progress:
              partial === undefined
                ? "processing"
                : typeof partial === "string"
                  ? partial
                  : JSON.stringify(partial),
          });
          break;
        }

        case "tool_execution_end": {
          const toolName = payload.toolName || payload.toolCall?.name || payload.toolCallId || "tool";
          queue.push({
            type: "tool_call_end",
            request_id: runContext.requestId,
            tool: toolName,
            output: normalizeToolArgs(payload.result),
          });
          break;
        }

        case "error": {
          queue.push({
            type: "error",
            request_id: runContext.requestId,
            message_id: runContext.messageId,
            character_id: runContext.characterId,
            message: String(payload.error || "agent 执行出错"),
          });
          break;
        }

        case "agent_end": {
          const finalContent = this.extractFinalAssistantMessage(payload.messages);
          const normalized = stripCharacterPrefix(finalContent, runContext.characterName);

          finalSent = true;
          queue.push({
            type: "final",
            request_id: runContext.requestId,
            message_id: runContext.messageId,
            character_id: runContext.characterId,
            character_name: runContext.characterName,
            content: normalized,
          });
          queue.close();
          break;
        }

        default:
          break;
      }
    });

    try {
      await agent.prompt(this.buildSeedPrompt(character.name, responseLength));
    } catch (error) {
      queue.push({
        type: "error",
        request_id: runContext.requestId,
        message_id: runContext.messageId,
        character_id: runContext.characterId,
        message: error instanceof Error ? error.message : "agent 运行失败",
      });
      if (!finalSent) {
        finalSent = true;
        queue.push({
          type: "final",
          request_id: runContext.requestId,
          message_id: runContext.messageId,
          character_id: runContext.characterId,
          character_name: runContext.characterName,
          content: "",
        });
      }
      queue.close();
    } finally {
      unsubscribe();
      if (!finalSent) {
        finalSent = true;
        queue.push({
          type: "final",
          request_id: runContext.requestId,
          message_id: runContext.messageId,
          character_id: runContext.characterId,
          character_name: runContext.characterName,
          content: "",
        });
      }
      await agent.waitForIdle().catch(() => undefined);
    }

    yield* queue;
  }

  private createTools(runtime: OrchestratorRuntime): Array<Record<string, unknown>> {
    const parseName = (args: Record<string, unknown>): string => {
      if (typeof args.name !== "string") {
        throw new Error("变量名不能为空");
      }
      const name = args.name.trim();
      if (!name) {
        throw new Error("变量名不能为空");
      }
      return name;
    };

    const parseScope = (scope: unknown): VariableScope => {
      return scope === "global" ? "global" : "room";
    };

    const parseNumber = (value: unknown, fallback: number): number => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return fallback;
    };

    const normalizeList = async (scope: VariableScope): Promise<Record<string, unknown>> => {
      const rows = await Promise.resolve(
        scope === "global"
          ? runtime.listGlobalVariables()
          : runtime.listRoomVariables(runtime.roomId),
      );
      const output: Record<string, unknown> = {};
      for (const item of rows || []) {
        output[item.name] = item.value;
      }
      return output;
    };

    return [
      {
        name: "get_variable",
        label: "读取变量",
        description: "读取房间变量或全局变量",
        parameters: Type.Object({
          name: Type.String(),
          scope: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("global")])),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const name = parseName(args);
          const scope = parseScope(args.scope);
          const values = await normalizeList(scope);
          return {
            content: [{ type: "text", text: normalizeVariableValue(values[name]) }],
            details: { name, scope, found: Object.prototype.hasOwnProperty.call(values, name) },
          } as ToolResult;
        },
      },
      {
        name: "set_variable",
        label: "设置变量",
        description: "设置房间变量或全局变量",
        parameters: Type.Object({
          name: Type.String(),
          value: Type.Any(),
          scope: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("global")])),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const name = parseName(args);
          const scope = parseScope(args.scope);
          const value = args.value;
          const saved = await Promise.resolve(runtime.setVariable(scope, name, value));
          return {
            content: [{ type: "text", text: `${name}=${normalizeVariableValue(saved.value)}` }],
            details: { name, scope, value: saved.value },
          } as ToolResult;
        },
      },
      {
        name: "add_variable",
        label: "新增/追加变量",
        description: "对房间变量或全局变量执行 add 操作",
        parameters: Type.Object({
          name: Type.String(),
          value: Type.Any(),
          scope: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("global")])),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const name = parseName(args);
          const scope = parseScope(args.scope);
          const value = args.value;
          const saved = await Promise.resolve(runtime.addVariable(scope, name, value));
          return {
            content: [{ type: "text", text: `${name}=${normalizeVariableValue(saved.value)}` }],
            details: { name, scope, value: saved.value },
          } as ToolResult;
        },
      },
      {
        name: "inc_variable",
        label: "变量递增",
        description: "使变量递增 1 或指定 delta",
        parameters: Type.Object({
          name: Type.String(),
          delta: Type.Optional(Type.Any()),
          scope: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("global")])),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const name = parseName(args);
          const scope = parseScope(args.scope);
          const delta = parseNumber(args.delta, 1);
          const saved = await Promise.resolve(runtime.incVariable(scope, name, delta));
          return {
            content: [{ type: "text", text: `${name}=${normalizeVariableValue(saved.value)}` }],
            details: { name, scope, delta, value: saved.value },
          } as ToolResult;
        },
      },
      {
        name: "dec_variable",
        label: "变量递减",
        description: "使变量递减 1 或指定 delta",
        parameters: Type.Object({
          name: Type.String(),
          delta: Type.Optional(Type.Any()),
          scope: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("global")])),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const name = parseName(args);
          const scope = parseScope(args.scope);
          const delta = parseNumber(args.delta, 1);
          const saved = await Promise.resolve(runtime.decVariable(scope, name, delta));
          return {
            content: [{ type: "text", text: `${name}=${normalizeVariableValue(saved.value)}` }],
            details: { name, scope, delta, value: saved.value },
          } as ToolResult;
        },
      },
      {
        name: "list_variables",
        label: "列出变量",
        description: "读取全部 room/global 变量",
        parameters: Type.Object({
          scope: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("global")])),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const scope = parseScope(args.scope);
          const all = await normalizeList(scope);
          return {
            content: [{ type: "text", text: JSON.stringify(all) }],
            details: { scope, count: Object.keys(all).length },
          } as ToolResult;
        },
      },
    ];
  }

  private composeSystemPrompt(
    character: Character,
    room: ChatRoom,
    responseLength: ResponseLength,
    variableContext: {
      room: Record<string, unknown>;
      global: Record<string, unknown>;
    },
  ): string {
    const lines = [
      `你正在参与一场多角色聊天场景，对话中你是角色：${character.name}。`,
      character.speaking_style ? `说话风格：${character.speaking_style}` : "",
      character.personality ? `性格要素：${character.personality}` : "",
      character.background ? `背景：${character.background}` : "",
      character.description ? `角色描述：${character.description}` : "",
      character.scenario ? `场景：${character.scenario}` : "",
      room.description ? `聊天室说明：${room.description}` : "",
      character.system_prompt_override ? `系统指令：${character.system_prompt_override}` : "",
      character.post_instructions ? `附加指令：${character.post_instructions}` : "",
      `长度要求：${LENGTH_GUIDANCE[responseLength]}`,
      character.greeting ? `开场参考：${character.greeting}` : "",
      room.user_description ? `用户附加设定：${room.user_description}` : "",
    ];

    if (Object.keys(variableContext.room).length > 0) {
      lines.push(`当前房间变量：${JSON.stringify(variableContext.room)}`);
    }

    if (Object.keys(variableContext.global).length > 0) {
      lines.push(`当前全局变量：${JSON.stringify(variableContext.global)}`);
    }

    return lines.filter(Boolean).join("\n\n");
  }

  private buildSeedPrompt(characterName: string, responseLength: ResponseLength): string {
    return `继续发言，以「${characterName}」身份进行对话，遵循${responseLength}风格，不要重复角色前缀。`;
  }

  private buildConversationMessages(room: ChatRoom): SimpleMessage[] {
    return room.messages
      .slice(-120)
      .map((message) => {
        if (message.sender_type === "ai") {
          return {
            role: "assistant",
            content: `${message.character_name}: ${message.content}`,
          };
        }

        if (message.is_system) {
          return {
            role: "system",
            content: message.content,
          };
        }

        return {
          role: "user",
          content: `${message.character_name}: ${message.content}`,
        };
      }) as SimpleMessage[];
  }

  private extractFinalAssistantMessage(messages: unknown[] | undefined): string {
    if (!Array.isArray(messages) || messages.length === 0) {
      return "";
    }

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const item = messages[i] as { role?: string; content?: unknown };
      if (item?.role === "assistant") {
        return extractTextFromContent(item.content);
      }
    }

    return "";
  }
}
