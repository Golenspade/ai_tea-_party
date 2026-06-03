import type { Message as WsPayloadMessage } from "@ai-party/shared";
import type { WebSocket } from "ws";

import type { WsMessage } from "@ai-party/shared";

type RoomId = string;

interface ClientEnvelope {
  socket: WebSocket;
  roomId: string;
}

export class RoomSocketManager {
  private rooms = new Map<RoomId, Set<WebSocket>>();

  add(roomId: string, socket: WebSocket): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)?.add(socket);
  }

  remove(roomId: string, socket: WebSocket): void {
    const set = this.rooms.get(roomId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  count(roomId: string): number {
    return this.rooms.get(roomId)?.size || 0;
  }

  async send(roomId: string, payload: WsMessage): Promise<void> {
    const encoded = JSON.stringify(payload);
    const sockets = this.rooms.get(roomId);
    if (!sockets) return;

    await Promise.allSettled(
      Array.from(sockets).map(async (socket) => {
        if (socket.readyState === 1) {
          socket.send(encoded);
        }
      }),
    );
  }

  async broadcastMessage(roomId: string, message: WsPayloadMessage): Promise<void> {
    await this.send(roomId, { type: "message", data: message });
  }

  async broadcastCharacterUpdate(roomId: string, action: string, characterData: Record<string, unknown>): Promise<void> {
    await this.send(roomId, {
      type: "character_update",
      action,
      character: characterData,
    });
  }

  async broadcastRoomStatus(roomId: string, status: { is_auto_chat?: boolean }): Promise<void> {
    await this.send(roomId, {
      type: "room_status",
      data: status,
    });
  }
}
