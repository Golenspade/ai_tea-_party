import type { FastifyInstance, FastifyRequest } from "fastify";

import { appState } from "../store";
import type { RoomSocketManager } from "../room-hub";
import type { WebSocket } from "ws";

interface RoomIdParams {
  room_id: string;
}

interface WsConnection {
  socket: WebSocket;
}

export function registerWsRoutes(
  app: FastifyInstance,
  { socketManager }: { socketManager: RoomSocketManager },
): void {
  app.get<{ Params: RoomIdParams }>(
    "/ws/:room_id",
    { websocket: true },
    (connection: WsConnection, request: FastifyRequest<{ Params: RoomIdParams }>) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        connection.socket.close(1008, "聊天室不存在");
        return;
      }

      socketManager.add(roomId, connection.socket);

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
