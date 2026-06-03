import { randomBytes, randomUUID } from "node:crypto";

import type { Character, ChatRoom, StreamingEvent } from "@ai-party/shared";

import type { ResponseLength } from "./types";

export interface OrchestratorStreamSession {
  requestId: string;
  messageId: string;
  characterId: string;
  characterName: string;
  events: AsyncGenerator<StreamingEvent>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class ChatOrchestrator {
  private readonly enableToolEvents: boolean;
  private readonly chunkDelayMs: number;

  constructor() {
    this.enableToolEvents = process.env.ENABLE_TOOL_EVENTS === "1" || process.env.ENABLE_TOOL_EVENTS === "true";
    this.chunkDelayMs = Number(process.env.STREAM_CHUNK_DELAY_MS || "25");
  }

  async generateReply(room: ChatRoom, character: Character, responseLength: ResponseLength): Promise<{ requestId: string; messageId: string; content: string }> {
    const requestId = randomBytes(8).toString("hex");
    const messageId = randomUUID();
    const content = this.composeContent(room, character, responseLength);

    await sleep(Math.max(10, Math.floor(Math.min(this.chunkDelayMs, 120))));

    return {
      requestId,
      messageId,
      content,
    };
  }

  async generateReplyStream(room: ChatRoom, character: Character, responseLength: ResponseLength): Promise<OrchestratorStreamSession> {
    const requestId = randomBytes(8).toString("hex");
    const messageId = randomUUID();
    const content = this.composeContent(room, character, responseLength);

    const stream = this.streamEvents({
      requestId,
      messageId,
      characterId: character.id,
      characterName: character.name,
      content,
    });

    return {
      requestId,
      messageId,
      characterId: character.id,
      characterName: character.name,
      events: stream,
    };
  }

  private composeContent(room: ChatRoom, character: Character, responseLength: ResponseLength): string {
    const last = room.messages.at(-1);
    const suffix = last
      ? `${last.character_name}: ${String(last.content || "").slice(0, 48)}`
      : "欢迎加入茶话会";

    const lengthLabel =
      responseLength === "short"
        ? "简短"
        : responseLength === "long"
          ? "详细"
          : "适中";

    return `${character.name}已读取到上下文（${suffix}），按${lengthLabel}模式回复：${character.greeting || ""}`;
  }

  private async *streamEvents(params: {
    requestId: string;
    messageId: string;
    characterId: string;
    characterName: string;
    content: string;
  }): AsyncGenerator<StreamingEvent> {
    if (this.enableToolEvents) {
      yield {
        type: "tool_call_start",
        request_id: params.requestId,
        tool: "context_logger",
        args: { character_id: params.characterId },
      };
      await sleep(Math.max(8, this.chunkDelayMs));
      yield {
        type: "tool_call_update",
        request_id: params.requestId,
        tool: "context_logger",
        progress: "fetch context",
      };
      await sleep(Math.max(8, this.chunkDelayMs));
      yield {
        type: "tool_call_end",
        request_id: params.requestId,
        tool: "context_logger",
        output: { context_snapshot: true },
      };
    }

    const chunkSize = 8;
    for (let i = 0; i < params.content.length; i += chunkSize) {
      const segment = params.content.slice(i, i + chunkSize);
      if (segment) {
        yield {
          type: "delta",
          content: segment,
          message_id: params.messageId,
          character_id: params.characterId,
          character_name: params.characterName,
          request_id: params.requestId,
        };
        await sleep(this.chunkDelayMs);
      }
    }

    yield {
      type: "final",
      content: params.content,
      request_id: params.requestId,
      message_id: params.messageId,
      character_id: params.characterId,
      character_name: params.characterName,
    };
  }
}
