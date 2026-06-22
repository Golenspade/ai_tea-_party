import { randomBytes, randomUUID } from "node:crypto";

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Model } from "@earendil-works/pi-ai";
import type {
  Character,
  ChatRoom,
  Message,
  MessagePatch,
  PendingAsk,
  Persona,
  BehaviorRule,
  RoomBarSnapshot,
  RoomSummary,
  StreamingEvent,
  WorldInfoBook,
} from "@ai-party/shared";

import type { ResponseLength } from "../types";
import {
  buildSupplementalSystemMessages,
  CharacterMemory,
  updateCharacterMemoryFromHistory,
} from "./character-memory";
import { PromptAssembler } from "./prompt-assembler";
import { resolvePiModel } from "./resolve-pi-model";
import { parseAskUserInput, formatAskAnswer } from "./ask-user";
import { parseWriteToRoomInput, type WriteToRoomInput } from "./write-to-room";
import { parseWriteToBarInput, type WriteToBarInput } from "./write-to-bar";
import { parsePatchRoomInput, type PatchRoomInput } from "./patch-room";
import { mapToolExecutionToStreamingEvent } from "./tool-execution-events";

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
  listRoomWorldInfoBooks: (roomId: string) => Promise<WorldInfoBook[]> | WorldInfoBook[];
  listRoomSummaries: (roomId: string) => Promise<RoomSummary[]> | RoomSummary[];
  listBehaviorRules: (roomId: string) => Promise<BehaviorRule[]> | BehaviorRule[];
  getDefaultPersona?: () => Persona | null | undefined;
  speakingCharacterId: string;
  speakingCharacterName: string;
  listRoomCharacters: () => Character[];
  writeToRoom: (input: WriteToRoomInput) => Promise<Message>;
  patchRoom: (input: PatchRoomInput) => Promise<MessagePatch>;
  writeToBar: (input: WriteToBarInput) => Promise<RoomBarSnapshot>;
  createPendingAsk: (input: {
    requestId: string;
    toolCallId: string;
    question: string;
    choices: string[];
    allowCustom: boolean;
    multiple: boolean;
    agentMessagesJson: string;
    systemPrompt: string;
  }) => Promise<PendingAsk>;
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

interface AgentContextAccessor {
  getMessages: () => unknown[];
  getSystemPrompt: () => string;
}

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
  private readonly promptAssembler = new PromptAssembler();
  private readonly characterMemory = new CharacterMemory();

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

  async generateResumeStream(
    room: ChatRoom,
    character: Character,
    pendingAsk: PendingAsk,
    responseLength: ResponseLength,
    runtime: OrchestratorRuntime,
  ): Promise<OrchestratorStreamSession> {
    const requestId = randomBytes(8).toString("hex");
    const messageId = randomUUID();

    const events = this.streamResumeEvents(
      {
        requestId,
        messageId,
        characterId: character.id,
        characterName: character.name,
      },
      room,
      character,
      pendingAsk,
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
    let finalSent = false;
    let awaitingUser = false;
    let pendingAskId: string | null = null;

    let model = resolvePiModel(runtime.provider, runtime.model);
    if (!model) {
      queue.push({
        type: "error",
        request_id: runContext.requestId,
        message_id: runContext.messageId,
        character_id: runContext.characterId,
        message: `未找到可用模型：${runtime.provider}/${runtime.model}（请检查 provider 与模型 ID 是否与 pi-ai 兼容）`,
      });
      queue.close();
      yield* queue;
      return;
    }

    const variableContext = {
      room: await entriesToRecord(runtime.listRoomVariables(runtime.roomId)),
      global: await entriesToRecord(runtime.listGlobalVariables()),
    };

    const worldInfoBooks = await Promise.resolve(runtime.listRoomWorldInfoBooks(runtime.roomId));
    const summaries = await Promise.resolve(runtime.listRoomSummaries(runtime.roomId));
    const behaviorRules = await Promise.resolve(runtime.listBehaviorRules(runtime.roomId));
    updateCharacterMemoryFromHistory(this.characterMemory, room.messages);

    const assembled = this.promptAssembler.assemble({
      character,
      room,
      worldInfoBooks,
      summaries,
      behaviorRules,
      responseLength,
      variableContext,
      persona: runtime.getDefaultPersona?.() ?? null,
    });

    const systemPrompt = assembled.systemPrompt;
    const supplementalMessages = buildSupplementalSystemMessages(
      this.characterMemory,
      character,
      room.messages,
    );
    const baseMessages = [...assembled.messages, ...supplementalMessages];

    const agentContext: AgentContextAccessor = {
      getMessages: () => [],
      getSystemPrompt: () => systemPrompt,
    };

    const tools = this.createTools(
      runtime,
      (event) => {
        queue.push(event);
      },
      runContext,
      agentContext,
      () => {
        awaitingUser = true;
      },
      (askId) => {
        pendingAskId = askId;
      },
    );

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        messages: baseMessages.map((message) => ({
          role: message.role,
          content: [{ type: "text", text: message.content }],
          timestamp: Date.now(),
        })) as never,
      },
      beforeToolCall: async ({ toolCall, args }) => {
        if (process.env.NODE_ENV !== "production") {
          console.info(`beforeToolCall: ${toolCall.name} ${JSON.stringify(args)}`);
        }
        return undefined;
      },
      afterToolCall: async ({ toolCall, result }) => {
        if (process.env.NODE_ENV !== "production") {
          console.info(`afterToolCall: ${toolCall.name} ${JSON.stringify(result?.details ?? result)}`);
        }
        return undefined;
      },
    });

    agentContext.getMessages = () => {
      const state = (agent as { state?: { messages?: unknown[] } }).state;
      return state?.messages ?? [];
    };

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

        case "tool_execution_start":
        case "tool_execution_update":
        case "tool_execution_end": {
          queue.push(
            mapToolExecutionToStreamingEvent(payload.type, payload, runContext),
          );
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
          if (awaitingUser && pendingAskId) {
            finalSent = true;
            queue.push({
              type: "awaiting_user",
              request_id: runContext.requestId,
              ask_id: pendingAskId,
            });
            queue.close();
            break;
          }

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
      await agent.waitForIdle().catch(() => undefined);
      unsubscribe();
      if (!finalSent) {
        finalSent = true;
        if (awaitingUser && pendingAskId) {
          queue.push({
            type: "awaiting_user",
            request_id: runContext.requestId,
            ask_id: pendingAskId,
          });
        } else {
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
      }
    }

    yield* queue;
  }

  private async *streamResumeEvents(
    runContext: StreamContext,
    room: ChatRoom,
    character: Character,
    pendingAsk: PendingAsk,
    responseLength: ResponseLength,
    runtime: OrchestratorRuntime,
  ): AsyncGenerator<StreamingEvent> {
    const queue = new AsyncStreamingQueue<StreamingEvent>();
    let finalSent = false;

    const provider = pendingAsk.provider || runtime.provider;
    const modelId = pendingAsk.model || runtime.model;
    const model = resolvePiModel(provider, modelId);
    if (!model) {
      queue.push({
        type: "error",
        request_id: runContext.requestId,
        message_id: runContext.messageId,
        character_id: runContext.characterId,
        message: `未找到可用模型：${provider}/${modelId}`,
      });
      queue.close();
      yield* queue;
      return;
    }

    const systemPrompt = pendingAsk.system_prompt || "";
    let restoredMessages: unknown[] = [];
    try {
      restoredMessages = JSON.parse(pendingAsk.agent_messages_json || "[]") as unknown[];
    } catch {
      restoredMessages = [];
    }

    const answerText = formatAskAnswer(pendingAsk.answer || {});
    const agentContext: AgentContextAccessor = {
      getMessages: () => [],
      getSystemPrompt: () => systemPrompt,
    };

    const tools = this.createTools(
      runtime,
      (event) => queue.push(event),
      runContext,
      agentContext,
      () => undefined,
      () => undefined,
    );

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        messages: restoredMessages as never,
      },
      beforeToolCall: async () => undefined,
      afterToolCall: async () => undefined,
    });

    agentContext.getMessages = () => {
      const state = (agent as { state?: { messages?: unknown[] } }).state;
      return state?.messages ?? [];
    };

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

        case "tool_execution_start":
        case "tool_execution_update":
        case "tool_execution_end": {
          queue.push(
            mapToolExecutionToStreamingEvent(payload.type, payload, runContext),
          );
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
      await agent.prompt(
        `用户已回答：\n${answerText}\n\n请根据用户选择继续推进剧情。对白与旁白请使用 write_to_room；形势摘要请使用 write_to_bar。遵循${responseLength}风格。`,
      );
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
      await agent.waitForIdle().catch(() => undefined);
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
        queue.close();
      }
    }

    yield* queue;
  }

  private createTools(
    runtime: OrchestratorRuntime,
    emitEvent: (event: StreamingEvent) => void,
    runContext?: Pick<StreamContext, "requestId">,
    agentContext?: AgentContextAccessor,
    markAwaitingUser?: () => void,
    setPendingAskId?: (askId: string) => void,
  ): AgentTool[] {
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
        name: "write_to_room",
        label: "写入房间消息",
        description:
          "将剧情对白、角色发言或旁白写入房间正中消息流。对白用 sender_type=ai；旁白/叙述用 sender_type=system；不要在此写入场景摘要（那是 write_to_bar 的职责）。",
        parameters: Type.Object({
          content: Type.String({ description: "要写入房间的消息正文" }),
          character_id: Type.Optional(
            Type.String({ description: "发言角色 ID；省略则使用当前发言角色" }),
          ),
          sender_type: Type.Optional(
            Type.Union([Type.Literal("ai"), Type.Literal("user"), Type.Literal("system")]),
          ),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const input = parseWriteToRoomInput(args);
          const message = await Promise.resolve(runtime.writeToRoom(input));

          if (runContext?.requestId) {
            emitEvent({
              type: "room_message",
              request_id: runContext.requestId,
              message,
            });
          }

          return {
            content: [{ type: "text", text: `已写入房间消息 ${message.id}` }],
            details: {
              message_id: message.id,
              character_id: message.character_id,
              character_name: message.character_name,
              sender_type: message.sender_type,
            },
          } as ToolResult;
        },
      },
      {
        name: "patch_room",
        label: "修改房间消息",
        description:
          "修改已有 AI/旁白消息。用于删改重复、修正错漏或重写已发布段落；不要用它修改用户消息。",
        parameters: Type.Object({
          message_id: Type.String({ description: "要修改的消息 ID" }),
          content: Type.String({ description: "修改后的完整消息正文" }),
          reason: Type.Optional(Type.String({ description: "修改原因，供前端提示或审计" })),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const input = parsePatchRoomInput(args);
          const patch = await Promise.resolve(runtime.patchRoom(input));

          if (runContext?.requestId) {
            emitEvent({
              type: "message_patch",
              request_id: runContext.requestId,
              patch,
            });
          }

          return {
            content: [{ type: "text", text: `已修改房间消息 ${patch.message_id}` }],
            details: {
              message_id: patch.message_id,
              patched_at: patch.patched_at,
              reason: patch.reason,
            },
          } as ToolResult;
        },
      },
      {
        name: "write_to_bar",
        label: "写入状态栏",
        description:
          "更新房间顶栏的形势摘要（地点、时间、当前局面等）。不要写入对白或旁白（那是 write_to_room 的职责）。",
        parameters: Type.Object({
          content: Type.String({ description: "状态栏 Markdown 或纯文本内容" }),
          label: Type.Optional(Type.String({ description: "栏目标题，默认「当前形势」" })),
        }),
        execute: async (_toolCallId: string, args: Record<string, unknown>) => {
          const input = parseWriteToBarInput(args);
          const snapshot = await Promise.resolve(runtime.writeToBar(input));

          if (runContext?.requestId) {
            emitEvent({
              type: "bar_update",
              request_id: runContext.requestId,
              room_id: snapshot.room_id,
              content: snapshot.content,
              label: snapshot.label,
              version: snapshot.version,
            });
          }

          return {
            content: [{ type: "text", text: `已更新状态栏 v${snapshot.version}` }],
            details: {
              version: snapshot.version,
              label: snapshot.label,
            },
          } as ToolResult;
        },
      },
      {
        name: "ask_user",
        label: "询问用户",
        description:
          "当剧情需要用户做抉择时调用。提供 question 与 choices；可选 allow_custom / multiple。调用后 Agent 将挂起等待用户回答。",
        parameters: Type.Object({
          question: Type.String({ description: "向用户提出的问题" }),
          choices: Type.Array(Type.String(), { description: "可选答案列表" }),
          allow_custom: Type.Optional(Type.Boolean({ description: "是否允许自由输入" })),
          multiple: Type.Optional(Type.Boolean({ description: "是否允许多选" })),
        }),
        execute: async (toolCallId: string, args: Record<string, unknown>) => {
          const parsed = parseAskUserInput(args);
          const agentMessagesJson = JSON.stringify(agentContext?.getMessages() ?? []);
          const systemPrompt = agentContext?.getSystemPrompt() ?? "";

          const pending = await Promise.resolve(
            runtime.createPendingAsk({
              requestId: runContext?.requestId || randomBytes(8).toString("hex"),
              toolCallId,
              question: parsed.question,
              choices: parsed.choices,
              allowCustom: parsed.allowCustom,
              multiple: parsed.multiple,
              agentMessagesJson,
              systemPrompt,
            }),
          );

          markAwaitingUser?.();
          setPendingAskId?.(pending.id);

          if (runContext?.requestId) {
            emitEvent({
              type: "ask_pending",
              request_id: runContext.requestId,
              ask_id: pending.id,
              question: pending.question,
              choices: pending.choices,
              allow_custom: pending.allow_custom,
              multiple: pending.multiple,
            });
          }

          return {
            content: [{ type: "text", text: "已挂起，等待用户回答" }],
            details: { ask_id: pending.id },
            terminate: true,
          } as ToolResult;
        },
      },
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
    ] as AgentTool[];
  }

  private buildSeedPrompt(characterName: string, responseLength: ResponseLength): string {
    return `继续推进剧情。角色对白与旁白请优先使用 write_to_room 工具写入（旁白 sender_type=system）；场景形势请使用 write_to_bar；需要用户抉择时使用 ask_user。遵循${responseLength}风格。若已通过 write_to_room 发布正文，回复中不要重复相同内容，可留空或仅作简短说明。`;
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
