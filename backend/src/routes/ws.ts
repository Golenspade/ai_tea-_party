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

interface WsConnection {
  socket: WebSocket;
}

export function registerWsRoutes(
  app: FastifyInstance,
  { socketManager }: { socketManager: RoomSocketManager },
): void {
  app.get<{ Params: RoomIdParams; Querystring: WsQuery }>(
    "/ws/:room_id",
    { websocket: true },
    (connection: WsConnection, request: FastifyRequest<{ Params: RoomIdParams; Querystring: WsQuery }>) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        connection.socket.close(1008, "聊天室不存在");
        return;
      }

      const userId = request.query?.user_id || randomUUID();
      const nickname = (request.query?.nickname || "茶话会用户").trim() || "茶话会用户";

      socketManager.add(roomId, connection.socket, {
        user_id: userId,
        nickname,
        room_id: roomId,
      } as const);

      void socketManager.send(roomId, {
        type: "room_status",
        data: {
          is_auto_chat: room.is_auto_chat,
        },
      });

      connection.socket.on("close", () => {
        socketManager.remove(roomId, connection.socket);
      });
    },
  );
}
