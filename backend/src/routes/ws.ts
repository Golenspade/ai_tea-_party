import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";

import { appState } from "../store";
import type { RoomSocketManager } from "../room-hub";
import type { WebSocket } from "ws";

interface RoomIdParams {
  room_id: string;
}

interface WsQuery {
  user_id?: string;
  nickname?: string;
}

type WsRequest = FastifyRequest<{ Params: RoomIdParams; Querystring: WsQuery }>;

function handleRoomSocket(
  socket: WebSocket,
  request: WsRequest,
  socketManager: RoomSocketManager,
): void {
  const roomId = request.params?.room_id;
  if (!roomId) {
    socket.close(1011, "缺少 room_id");
    return;
  }

  const room = appState.getRoom(roomId);
  if (!room) {
    socket.close(1008, "聊天室不存在");
    return;
  }

  const userId = request.query?.user_id || randomUUID();
  const nickname = (request.query?.nickname || "茶话会用户").trim() || "茶话会用户";

  socketManager.add(roomId, socket, {
    user_id: userId,
    nickname,
    room_id: roomId,
  });

  void socketManager.send(roomId, {
    type: "room_status",
    data: {
      is_auto_chat: room.is_auto_chat,
    },
  });

  socket.on("close", () => {
    socketManager.remove(roomId, socket);
  });
}

export function registerWsRoutes(
  app: FastifyInstance,
  { socketManager }: { socketManager: RoomSocketManager },
): void {
  app.register(async (fastify) => {
    fastify.route<{ Params: RoomIdParams; Querystring: WsQuery }>({
      method: "GET",
      url: "/ws/:room_id",
      handler: async (_request, reply) => {
        return reply.code(426).send({ message: "Upgrade Required" });
      },
      wsHandler: (socket, request) => {
        handleRoomSocket(socket, request, socketManager);
      },
    });
  });
}
