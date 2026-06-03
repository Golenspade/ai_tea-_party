"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, PresenceUser, WsMessage } from "@/lib/types";

function generateUserId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const WS_BASE_URL = (process.env.NEXT_PUBLIC_WS_BASE_URL || "ws://localhost:3004").replace(/\/$/, "");

interface UseWebSocketOptions {
  onMessage: (message: Message) => void;
  onCharacterUpdate: () => void;
  onRoomStatus: (data: { is_auto_chat?: boolean }) => void;
  onPresence?: (users: PresenceUser[]) => void;
  roomId?: string;
  preferredNickname?: string;
  preferredUserId?: string;
}

export function useWebSocket({
  onMessage,
  onCharacterUpdate,
  onRoomStatus,
  onPresence,
  roomId = "default",
  preferredNickname,
  preferredUserId,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("茶话会用户");

  // 使用 ref 保持回调最新引用，避免 WebSocket 重连
  const callbacksRef = useRef({
    onMessage,
    onCharacterUpdate,
    onRoomStatus,
    onPresence,
  });
  callbacksRef.current = {
    onMessage,
    onCharacterUpdate,
    onRoomStatus,
    onPresence,
  };

  useEffect(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    let localUserId = "guest";
    let localNickname = "茶话会用户";

    if (storage) {
      const savedUserId = storage.getItem("ai-party-user-id");
      localUserId = preferredUserId || savedUserId || "";
      if (!localUserId) {
        localUserId = generateUserId();
        storage.setItem("ai-party-user-id", localUserId);
      } else if (preferredUserId) {
        storage.setItem("ai-party-user-id", preferredUserId);
      }

      const savedNickname = storage.getItem("ai-party-user-nickname") || "";
      localNickname = preferredNickname || savedNickname || localNickname;

      if (preferredNickname) {
        localNickname = preferredNickname.trim() || localNickname;
      }

      storage.setItem("ai-party-user-nickname", localNickname);
      storage.setItem("ai-party-user-id", localUserId);
    }

    setUserId(localUserId);
    setNickname(localNickname);

    const query = new URLSearchParams();
    query.set("user_id", localUserId);
    query.set("nickname", localNickname);

    const wsUrl = `${WS_BASE_URL}/ws/${roomId}?${query.toString()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      let data: WsMessage | null = null;
      try {
        data = JSON.parse(event.data) as WsMessage;
      } catch {
        return;
      }

      if (!data) return;

      if (data.type === "message") {
        callbacksRef.current.onMessage(data.data);
      } else if (data.type === "character_update") {
        callbacksRef.current.onCharacterUpdate();
      } else if (data.type === "room_status") {
        callbacksRef.current.onRoomStatus(data.data);
      } else if (data.type === "presence") {
        callbacksRef.current.onPresence?.(data.users);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, [roomId, onCharacterUpdate, onMessage, onRoomStatus, onPresence, preferredNickname, preferredUserId]);

  return { isConnected, userId, nickname, wsRef };
}
