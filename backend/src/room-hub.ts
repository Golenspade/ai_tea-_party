import type { DmNextSpeaker, Message as WsPayloadMessage, MessagePatch } from "@ai-party/shared";
import type { PresenceUser } from "./types";
import type { WebSocket } from "ws";

import type { WsMessage } from "@ai-party/shared";

type RoomId = string;

interface ClientEnvelope {
  socket: WebSocket;
  joinedAt: string;
}

export class RoomSocketManager {
  private rooms = new Map<RoomId, Set<WebSocket>>();
  private presence = new Map<RoomId, Map<WebSocket, PresenceUser>>();

  add(
    roomId: string,
    socket: WebSocket,
    payload: Pick<PresenceUser, "user_id" | "nickname" | "room_id">,
  ): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    if (!this.presence.has(roomId)) {
      this.presence.set(roomId, new Map());
    }

    this.rooms.get(roomId)?.add(socket);

    const joinedAt = new Date().toISOString();
    const presence: PresenceUser = {
      user_id: payload.user_id,
      nickname: payload.nickname,
      room_id: payload.room_id,
      is_online: true,
      joined_at: joinedAt,
    };
    this.presence.get(roomId)?.set(socket, presence);

    void this.broadcastPresence(roomId);
  }

  remove(roomId: string, socket: WebSocket): void {
    const set = this.rooms.get(roomId);
    if (!set) return;

    set.delete(socket);
    this.presence.get(roomId)?.delete(socket);

    if (set.size === 0) {
      this.rooms.delete(roomId);
      this.presence.delete(roomId);
    } else {
      void this.broadcastPresence(roomId);
    }
  }

  count(roomId: string): number {
    return this.rooms.get(roomId)?.size || 0;
  }

  getPresence(roomId: string): PresenceUser[] {
    const users = this.presence.get(roomId);
    if (!users) {
      return [];
    }

    const merged = new Map<string, PresenceUser>();
    users.forEach((payload) => {
      const existed = merged.get(payload.user_id);
      if (!existed || new Date(payload.joined_at).getTime() < new Date(existed.joined_at).getTime()) {
        merged.set(payload.user_id, payload);
      }
    });

    return Array.from(merged.values()).map((item) => ({
      ...item,
      is_online: true,
    }));
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

  async broadcastMessagePatch(roomId: string, patch: MessagePatch): Promise<void> {
    await this.send(roomId, { type: "message_patch", patch });
  }

  async broadcastDmNextSpeaker(roomId: string, choice: DmNextSpeaker): Promise<void> {
    await this.send(roomId, { type: "dm_next_speaker", choice });
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

  async broadcastPresence(roomId: string): Promise<void> {
    const users = this.getPresence(roomId);
    await this.send(roomId, {
      type: "presence",
      room_id: roomId,
      users,
    });
  }

  async broadcastBarUpdate(
    roomId: string,
    payload: { content: string; label: string; version: number },
  ): Promise<void> {
    await this.send(roomId, {
      type: "bar_update",
      room_id: roomId,
      content: payload.content,
      label: payload.label,
      version: payload.version,
    });
  }

  async broadcastAskPending(
    roomId: string,
    ask: {
      id: string;
      room_id: string;
      request_id: string;
      character_id: string;
      question: string;
      choices: string[];
      allow_custom: boolean;
      multiple: boolean;
      status: "pending" | "resolved" | "expired";
      created_at: string;
    },
  ): Promise<void> {
    await this.send(roomId, {
      type: "ask_pending",
      ask,
    });
  }

  async broadcastAskResolved(roomId: string, askId: string, answer: { selected?: string[]; custom?: string }): Promise<void> {
    await this.send(roomId, {
      type: "ask_resolved",
      ask_id: askId,
      answer,
    });
  }
}
