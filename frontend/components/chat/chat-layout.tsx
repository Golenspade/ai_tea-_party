"use client";

import { useState, useCallback } from "react";
import type { Character, Message, CharacterFormData, ApiConfig } from "@/lib/types";
import { useWebSocket } from "@/hooks/use-websocket";
import * as api from "@/services/api";
import { SidebarMain } from "@/components/sidebar/sidebar-main";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatBottombar } from "@/components/chat/chat-bottombar";
import { ApiConfigDialog } from "@/components/dialogs/api-config-dialog";
import { useEffect } from "react";

export function ChatLayout() {
  // --- 核心状态 ---
  const [characters, setCharacters] = useState<Character[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAutoChat, setIsAutoChat] = useState(false);

  // --- WebSocket ---
  const handleWsMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const exists = prev.find((m) => m.id === msg.id);
      if (exists) {
        return prev.map((m) =>
          m.id === msg.id
            ? { ...m, content: msg.content, timestamp: msg.timestamp }
            : m,
        );
      }
      return [...prev, msg];
    });
  }, []);

  const handleCharacterUpdate = useCallback(() => {
    loadCharacters();
  }, []);

  const handleRoomStatus = useCallback(
    (data: { is_auto_chat?: boolean }) => {
      if (data.is_auto_chat !== undefined) {
        setIsAutoChat(data.is_auto_chat);
      }
    },
    [],
  );

  const { isConnected } = useWebSocket({
    onMessage: handleWsMessage,
    onCharacterUpdate: handleCharacterUpdate,
    onRoomStatus: handleRoomStatus,
  });

  // --- 数据加载 ---
  const loadCharacters = async () => {
    try {
      const data = await api.fetchCharacters();
      setCharacters(data);
    } catch (error) {
      console.error("Failed to fetch characters:", error);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, []);

  // --- 事件处理器 ---
  const handleAddCharacter = async (data: CharacterFormData) => {
    try {
      await api.addCharacter(data);
      loadCharacters();
    } catch (error) {
      console.error("Failed to add character:", error);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    try {
      await api.deleteCharacter(id);
      loadCharacters();
    } catch (error) {
      console.error("Failed to delete character:", error);
    }
  };

  const handleSendMessage = async (characterId: string, content: string) => {
    try {
      await api.sendMessage(characterId, content);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleAISpeech = async (characterId: string) => {
    const targetCharacter = characters.find((c) => c.id === characterId);
    const tempId = `stream-${Date.now()}`;
    const placeholder: Message = {
      id: tempId,
      character_id: characterId,
      character_name: targetCharacter?.name || "AI",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, placeholder]);

    try {
      const response = await api.streamAIResponse(characterId);

      if (!response.ok || !response.body) {
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        events.forEach((event) => {
          const line = event.trim();
          if (!line.startsWith("data:")) return;
          const payload = line.replace(/^data:\s*/, "");
          if (!payload) return;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "chunk" && parsed.content) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempId
                    ? { ...msg, content: (msg.content || "") + parsed.content }
                    : msg,
                ),
              );
            } else if (parsed.type === "end" && parsed.message_id) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempId ? { ...msg, id: parsed.message_id } : msg,
                ),
              );
            } else if (parsed.type === "error") {
              setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
            }
          } catch {
            // ignore parse errors
          }
        });

        if (done) break;
      }

      // 处理缓冲区残留
      if (buffer.trim()) {
        const remaining = buffer.split("\n\n");
        remaining.forEach((event) => {
          const line = event.trim();
          if (!line.startsWith("data:")) return;
          const payload = line.replace(/^data:\s*/, "");
          if (!payload) return;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "end" && parsed.message_id) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempId ? { ...msg, id: parsed.message_id } : msg,
                ),
              );
            }
          } catch {
            // ignore
          }
        });
      }
    } catch (error) {
      console.error("Error generating AI message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  };

  const handleStartAutoChat = async () => {
    try {
      await api.startAutoChat();
      setIsAutoChat(true);
    } catch (error) {
      console.error("Failed to start auto chat:", error);
    }
  };

  const handleStopAutoChat = async () => {
    try {
      await api.stopAutoChat();
      setIsAutoChat(false);
    } catch (error) {
      console.error("Failed to stop auto chat:", error);
    }
  };

  const handleClearMessages = async () => {
    try {
      await api.clearMessages();
    } catch (error) {
      console.error("Failed to clear messages:", error);
    }
    setMessages([]);
  };

  const handleSaveApiConfig = async (config: ApiConfig) => {
    try {
      await api.saveApiConfig(config);
    } catch (error) {
      console.error("Failed to save API config:", error);
    }
  };

  // --- 渲染 ---
  return (
    <div className="h-screen w-full max-w-[1400px] mx-auto flex p-0 sm:p-8">
      {/* Combine sidebar and main into a paper-like book block */}
      <div className="flex-1 flex w-full bg-[#fdfaf5] shadow-2xl overflow-hidden sm:rounded-sm border-x sm:border-[var(--theme-border)]">
        <SidebarMain
          characters={characters}
          isAutoChat={isAutoChat}
          onAISpeech={handleAISpeech}
          onDeleteCharacter={handleDeleteCharacter}
          onAddCharacter={handleAddCharacter}
          onStartAutoChat={handleStartAutoChat}
          onStopAutoChat={handleStopAutoChat}
          onClearMessages={handleClearMessages}
        />

        {/* Chat Area */}
        <main className="flex-1 bg-white page-shadow relative overflow-hidden flex flex-col">
          {/* Top Navbar / Controls */}
          <div className="absolute top-6 right-8 z-10 flex items-center gap-5">
            {isAutoChat && (
              <span className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold animate-pulse">
                [Auto-Dialogue]
              </span>
            )}
            <ApiConfigDialog onSave={handleSaveApiConfig} />
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-700/70" : "bg-red-700/70"} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} title={isConnected ? "Connected" : "Disconnected"} />
          </div>

          <ChatMessageList messages={messages} characters={characters} />

          <ChatBottombar
            characters={characters}
            onSendMessage={handleSendMessage}
          />
        </main>
      </div>
    </div>
  );
}
