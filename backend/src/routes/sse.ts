import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { appState } from "../store";
import type { RoomSocketManager } from "../room-hub";
import type { Message } from "@ai-party/shared";

interface RoomIdParams {
  room_id: string;
}

interface GenerateRequestBody {
  character_id: string;
}

interface ResolvedGenerator {
  character: {
    id: string;
    name: string;
  };
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
    character: {
      id: character.id,
      name: character.name,
    },
  };
}

function serializeSsePayload(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamText(
  reply: FastifyReply,
  text: string,
  requestId: string,
  characterId: string,
  characterName: string,
) {
  const chunkSize = 6;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    if (!chunk) {
      continue;
    }

    reply.raw.write(
      serializeSsePayload({
        type: "delta",
        content: chunk,
        message_id: requestId,
        character_id: characterId,
        character_name: characterName,
        request_id: requestId,
      }),
    );
    await sleep(25);
  }
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

      let generated: { message: Message; requestId: string };
      try {
        generated = await appState.generateAiReply(
          request.params.room_id,
          resolved.character.id,
        );
      } catch (error) {
        return reply.code(500).send({ detail: error instanceof Error ? error.message : "生成回复失败" });
      }

      const { message, requestId } = generated;

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.code(200);

      let aborted = false;
      const handleAbort = () => {
        aborted = true;
      };
      reply.raw.on("close", handleAbort);
      reply.raw.on("error", handleAbort);

      try {
        await streamText(
          reply,
          message.content,
          requestId,
          resolved.character.id,
          resolved.character.name,
        );
      } finally {
        reply.raw.removeAllListeners("close");
        reply.raw.removeAllListeners("error");
      }

      if (!aborted) {
        const finalMessage: Message = {
          ...message,
          id: requestId,
          timestamp: message.timestamp || new Date().toISOString(),
        };
        await socketManager.broadcastMessage(request.params.room_id, finalMessage);

        reply.raw.write(
          serializeSsePayload({
            type: "final",
            content: message.content,
            request_id: requestId,
            message_id: requestId,
          }),
        );
      }

      reply.raw.end();
    },
  );
}
