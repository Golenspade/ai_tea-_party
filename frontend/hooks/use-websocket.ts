"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/types";

const WS_URL = "ws://localhost:3004/ws/default";

interface UseWebSocketOptions {
  onMessage: (message: Message) => void;
  onCharacterUpdate: () => void;
  onRoomStatus: (data: { is_auto_chat?: boolean }) => void;
}

export function useWebSocket({
  onMessage,
  onCharacterUpdate,
  onRoomStatus,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // 使用 ref 保持回调最新引用，避免 WebSocket 重连
  const callbacksRef = useRef({ onMessage, onCharacterUpdate, onRoomStatus });
  callbacksRef.current = { onMessage, onCharacterUpdate, onRoomStatus };

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        callbacksRef.current.onMessage(data.data);
      } else if (data.type === "character_update") {
        callbacksRef.current.onCharacterUpdate();
      } else if (data.type === "room_status") {
        callbacksRef.current.onRoomStatus(data.data);
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
  }, []);

  return { isConnected, wsRef };
}
