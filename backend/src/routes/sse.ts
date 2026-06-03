import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { appState } from "../store";
import type { RoomSocketManager } from "../room-hub";
import type { StreamingEvent, Character } from "@ai-party/shared";

interface RoomIdParams {
  room_id: string;
}

interface GenerateRequestBody {
  character_id: string;
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
        const generated = await appState.generateAiReply(request.params.room_id, resolved.character.id);
        const { message, requestId } = generated;
        await socketManager.broadcastMessage(request.params.room_id, message);
        return {
          message: "回复生成成功",
          request_id: requestId,
          content: message.content,
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
        );
      } catch (error) {
        return reply.code(500).send({ detail: error instanceof Error ? error.message : "生成回复失败" });
      }

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.code(200);

      let aborted = false;
      let finalContent: string | undefined;
      let finalMessageId: string = session.messageId;
      const handleAbort = () => {
        aborted = true;
        reply.raw.removeAllListeners("close");
        reply.raw.removeAllListeners("error");
      };
      reply.raw.on("close", handleAbort);
      reply.raw.on("error", handleAbort);

      try {
        if (!session) {
          return;
        }

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
          }
        }
      } finally {
        reply.raw.removeAllListeners("close");
        reply.raw.removeAllListeners("error");
      }

      if (!aborted && finalContent !== undefined) {
        const message = appState.createAiMessageFromStreamResult(
          resolved.character,
          finalMessageId,
          finalContent,
        );
        appState.addRoomMessage(request.params.room_id, message);
        await socketManager.broadcastMessage(request.params.room_id, message);
      }

      reply.raw.end();
    },
  );
}
