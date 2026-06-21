import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { appState, type AgentSessionHooks } from "../store";
import type { RoomSocketManager } from "../room-hub";
import type { StreamingEvent, Character } from "@ai-party/shared";
import { pendingAskToPublic } from "../services/ask-user";

interface RoomIdParams {
  room_id: string;
}

interface GenerateRequestBody {
  character_id: string;
}

interface ResumeRequestBody {
  ask_id: string;
}

interface ResolvedGenerator {
  character: Character;
}

function withValidCharacter(
  roomId: string,
  request: FastifyRequest<{ Params: RoomIdParams; Body: GenerateRequestBody }>,
): ResolvedGenerator | { errorCode: number; detail: string } {
  const room = appState.getRoom(roomId);
  if (!room) {
    return { errorCode: 404, detail: "聊天室不存在" };
  }

  const characterId = (request.body?.character_id || "").trim();
  if (!characterId) {
    return { errorCode: 400, detail: "角色不能为空" };
  }

  const character = room.characters.find((item) => item.id === characterId);
  if (!character) {
    return { errorCode: 404, detail: "角色不存在" };
  }

  return {
    character,
  };
}

function serializeSsePayload(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildSessionHooks(roomId: string, socketManager: RoomSocketManager): AgentSessionHooks {
  return {
    onRoomMessage: async (message) => {
      await socketManager.broadcastMessage(roomId, message);
    },
    onMessagePatch: async (patch) => {
      await socketManager.broadcastMessagePatch(roomId, patch);
    },
    onBarUpdate: async (snapshot) => {
      await socketManager.broadcastBarUpdate(roomId, {
        content: snapshot.content,
        label: snapshot.label,
        version: snapshot.version,
      });
    },
    onAskPending: async (ask) => {
      await socketManager.broadcastAskPending(roomId, pendingAskToPublic(ask));
    },
  };
}

async function pipeStreamToSse(
  reply: FastifyReply,
  roomId: string,
  character: Character,
  socketManager: RoomSocketManager,
  session: {
    requestId: string;
    messageId: string;
    events: AsyncGenerator<StreamingEvent>;
  },
): Promise<void> {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.code(200);

  let aborted = false;
  let finalContent: string | undefined;
  let finalMessageId: string = session.messageId;
  let awaitingUser = false;

  const handleAbort = () => {
    aborted = true;
    reply.raw.removeAllListeners("close");
    reply.raw.removeAllListeners("error");
  };
  reply.raw.on("close", handleAbort);
  reply.raw.on("error", handleAbort);

  try {
    for await (const event of session.events) {
      if (aborted) {
        break;
      }

      reply.raw.write(serializeSsePayload(event));

      if (event.type === "final") {
        finalContent = event.content;
        if (event.message_id) {
          finalMessageId = event.message_id;
        }
      } else if (event.type === "awaiting_user") {
        awaitingUser = true;
      }
    }
  } finally {
    reply.raw.removeAllListeners("close");
    reply.raw.removeAllListeners("error");
  }

  if (!aborted && !awaitingUser && finalContent !== undefined && finalContent.trim() !== "") {
    const message = appState.createAiMessageFromStreamResult(
      character,
      finalMessageId,
      finalContent,
    );
    appState.addRoomMessage(roomId, message);
    await socketManager.broadcastMessage(roomId, message);
  }

  reply.raw.end();
}

export function registerSseRoutes(
  app: FastifyInstance,
  socketManager: RoomSocketManager,
): void {
  app.post<{ Params: RoomIdParams; Body: GenerateRequestBody }>(
    "/api/rooms/:room_id/generate",
    async (request, reply) => {
      const resolved = withValidCharacter(request.params.room_id, request);
      if ("errorCode" in resolved) {
        return reply.code(resolved.errorCode).send({ detail: resolved.detail });
      }

      try {
        const generated = await appState.generateAiReply(
          request.params.room_id,
          resolved.character.id,
          buildSessionHooks(request.params.room_id, socketManager),
        );
        const { message, requestId } = generated;
        if (message) {
          await socketManager.broadcastMessage(request.params.room_id, message);
        }
        return {
          message: message ? "回复生成成功" : "回复生成成功（内容已通过 write_to_room 写入）",
          request_id: requestId,
          content: message?.content ?? "",
        };
      } catch (error) {
        return reply.code(500).send({ detail: error instanceof Error ? error.message : "生成回复失败" });
      }
    },
  );

  app.post<{ Params: RoomIdParams; Body: GenerateRequestBody }>(
    "/api/rooms/:room_id/generate/stream",
    async (request, reply) => {
      const resolved = withValidCharacter(request.params.room_id, request);
      if ("errorCode" in resolved) {
        return reply.code(resolved.errorCode).send({ detail: resolved.detail });
      }

      let session:
        | {
            requestId: string;
            messageId: string;
            events: AsyncGenerator<StreamingEvent>;
          }
        | undefined;

      try {
        session = await appState.startAiReplyStream(
          request.params.room_id,
          resolved.character.id,
          buildSessionHooks(request.params.room_id, socketManager),
        );
      } catch (error) {
        return reply.code(500).send({ detail: error instanceof Error ? error.message : "生成回复失败" });
      }

      await pipeStreamToSse(reply, request.params.room_id, resolved.character, socketManager, session);
    },
  );

  app.post<{ Params: RoomIdParams; Body: ResumeRequestBody }>(
    "/api/rooms/:room_id/generate/stream/resume",
    async (request, reply) => {
      const roomId = request.params.room_id;
      const askId = (request.body?.ask_id || "").trim();
      if (!askId) {
        return reply.code(400).send({ detail: "ask_id 不能为空" });
      }

      const pending = appState.getPendingAsk(askId);
      if (!pending || pending.room_id !== roomId) {
        return reply.code(404).send({ detail: "Ask 不存在" });
      }

      const room = appState.getRoom(roomId);
      const character = room?.characters.find((item) => item.id === pending.character_id);
      if (!room || !character) {
        return reply.code(404).send({ detail: "角色不存在" });
      }

      let session:
        | {
            requestId: string;
            messageId: string;
            events: AsyncGenerator<StreamingEvent>;
          }
        | undefined;

      try {
        session = await appState.startAiResumeStream(
          roomId,
          askId,
          buildSessionHooks(roomId, socketManager),
        );
      } catch (error) {
        return reply.code(500).send({ detail: error instanceof Error ? error.message : "恢复生成失败" });
      }

      await pipeStreamToSse(reply, roomId, character, socketManager, session);
    },
  );
}
