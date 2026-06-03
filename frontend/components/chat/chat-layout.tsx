"use client";

import { useState, useCallback, useMemo } from "react";
import type {
  Character,
  Message,
  CharacterFormData,
  ApiConfig,
  PresenceUser,
  PendingAskPublic,
  AskAnswer,
  RoomBarSnapshot,
} from "@/lib/types";
import { RoomStatusBar } from "@/components/chat/room-status-bar";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTypewriter } from "@/hooks/use-typewriter";
import * as api from "@/services/api";
import { SidebarMain } from "@/components/sidebar/sidebar-main";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatBottombar } from "@/components/chat/chat-bottombar";
import { ApiConfigDialog } from "@/components/dialogs/api-config-dialog";
import { useEffect } from "react";
import type { VariableEntry, VariablePatchRequest, VariableScope, VariableSetRequest } from "@/lib/types";

export function ChatLayout() {
  // --- 核心状态 ---
  const [characters, setCharacters] = useState<Character[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAutoChat, setIsAutoChat] = useState(false);
  const [roomVariables, setRoomVariables] = useState<VariableEntry[]>([]);
  const [globalVariables, setGlobalVariables] = useState<VariableEntry[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [displayNickname, setDisplayNickname] = useState<string>(() => {
    if (typeof window === "undefined") return "茶话会用户";
    return window.localStorage.getItem("ai-party-user-nickname") || "茶话会用户";
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(displayNickname);
  const [roomBar, setRoomBar] = useState<Pick<RoomBarSnapshot, "content" | "label" | "version"> | null>(null);
  const [pendingAsk, setPendingAsk] = useState<PendingAskPublic | null>(null);
  const [isAskSubmitting, setIsAskSubmitting] = useState(false);

  const appendRoomMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const existsById = prev.find((m) => m.id === msg.id);
      if (existsById) {
        return prev.map((m) =>
          m.id === msg.id
            ? { ...m, content: msg.content, timestamp: msg.timestamp }
            : m,
        );
      }

      const duplicate = prev.find(
        (m) =>
          m.character_id === msg.character_id &&
          m.content === msg.content &&
          !m.is_system &&
          ((m.sender_type !== "user") ||
            (m.sender_type === "user" && m.sender_user_id === msg.sender_user_id)),
      );
      if (duplicate) {
        return prev;
      }

      return [...prev, msg];
    });
  }, []);

  // --- WebSocket ---
  const handleWsMessage = useCallback((msg: Message) => {
    appendRoomMessage(msg);
  }, [appendRoomMessage]);

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

  const handlePresence = useCallback((users: PresenceUser[]) => {
    setOnlineUsers(users.filter((item) => item.is_online));
  }, []);

  const handleBarUpdate = useCallback((bar: Pick<RoomBarSnapshot, "content" | "label" | "version">) => {
    setRoomBar(bar);
  }, []);

  const handleAskPending = useCallback((ask: PendingAskPublic) => {
    setPendingAsk(ask);
  }, []);

  const handleAskResolved = useCallback((askId: string) => {
    setPendingAsk((prev) => (prev?.id === askId ? null : prev));
  }, []);

  const { isConnected, userId } = useWebSocket({
    onMessage: handleWsMessage,
    onCharacterUpdate: handleCharacterUpdate,
    onRoomStatus: handleRoomStatus,
    onPresence: handlePresence,
    onBarUpdate: handleBarUpdate,
    onAskPending: handleAskPending,
    onAskResolved: (askId) => handleAskResolved(askId),
    preferredNickname: displayNickname,
  });

  const normalizedNickname = useMemo(
    () => displayNickname.trim() || "茶话会用户",
    [displayNickname],
  );

  const handleRename = async () => {
    const trimmed = nicknameDraft.trim();
    if (!trimmed) {
      setNicknameDraft(normalizedNickname);
      setIsRenaming(false);
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem("ai-party-user-nickname", trimmed);
    }

    setDisplayNickname(trimmed);
    setIsRenaming(false);
  };

  // --- 数据加载 ---
  const loadCharacters = async () => {
    try {
      const data = await api.fetchCharacters();
      setCharacters(data);
    } catch (error) {
      console.error("Failed to fetch characters:", error);
    }
  };

  const loadMessages = async () => {
    try {
      const data = await api.fetchRoomMessages();
      setMessages(data);
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };

  const loadVariables = async () => {
    setVariablesLoading(true);
    try {
      const [roomVars, globalVars] = await Promise.all([
        api.fetchRoomVariables(),
        api.fetchGlobalVariables(),
      ]);
      setRoomVariables(roomVars);
      setGlobalVariables(globalVars);
    } catch (error) {
      console.error("Failed to fetch variables:", error);
    } finally {
      setVariablesLoading(false);
    }
  };

  const loadPresence = async () => {
    try {
      const users = await api.fetchRoomPresence();
      setOnlineUsers(users.filter((item) => item.is_online));
    } catch (error) {
      console.error("Failed to fetch presence:", error);
    }
  };

  const loadRoomBar = async () => {
    try {
      const bar = await api.fetchRoomBar();
      if (bar?.content) {
        setRoomBar({
          content: bar.content,
          label: bar.label,
          version: bar.version,
        });
      }
    } catch (error) {
      console.error("Failed to fetch room bar:", error);
    }
  };

  const loadPendingAsk = async () => {
    try {
      const ask = await api.fetchPendingAsk();
      setPendingAsk(ask);
    } catch (error) {
      console.error("Failed to fetch pending ask:", error);
    }
  };

  useEffect(() => {
    loadCharacters();
    loadMessages();
    loadVariables();
    loadPresence();
    loadRoomBar();
    loadPendingAsk();
  }, []);

  useEffect(() => {
    if (isConnected) {
      void loadPresence();
    }
  }, [isConnected]);

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
      await api.sendMessage(characterId, content, "default", {
        sender_type: "user",
        sender_user_id: userId,
        sender_user_name: normalizedNickname,
      });
      await loadMessages();
      if (
        content.trim().startsWith("/") ||
        content.includes("{{") && content.includes("::")
      ) {
        void loadVariables();
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const refreshVariables = () => {
    void loadVariables();
  };

  const handleVariableSet = async (
    scope: VariableScope,
    data: VariableSetRequest,
  ): Promise<void> => {
    await api.setVariable("default", scope, data);
    await loadVariables();
  };

  const handleVariableAdd = async (
    scope: VariableScope,
    data: VariablePatchRequest,
  ): Promise<void> => {
    await api.addVariable("default", scope, data);
    await loadVariables();
  };

  const handleVariableInc = async (
    scope: VariableScope,
    data: VariablePatchRequest,
  ): Promise<void> => {
    await api.incVariable("default", scope, data);
    await loadVariables();
  };

  const handleVariableDec = async (
    scope: VariableScope,
    data: VariablePatchRequest,
  ): Promise<void> => {
    await api.decVariable("default", scope, data);
    await loadVariables();
  };

  const handleVariableDelete = async (
    scope: VariableScope,
    name: string,
  ): Promise<void> => {
    await api.deleteVariable("default", scope, name);
    await loadVariables();
  };

  // --- 打字机效果 ---
  const typewriterUpdate = useCallback(
    (id: string, updater: (prev: string) => string) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id ? { ...msg, content: updater(msg.content || "") } : msg,
        ),
      );
    },
    [],
  );
  const { enqueue, flush, stop: stopTypewriter } = useTypewriter(typewriterUpdate);

  const processSseEvent = useCallback(
    (
      parsed: Record<string, unknown>,
      tempId: string,
      ctx: {
        finalRequestId: { current: string | null };
        awaitingUser: { current: boolean };
      },
    ) => {
      if (parsed.type === "delta" && typeof parsed.content === "string") {
        enqueue(tempId, parsed.content);
      } else if (parsed.type === "room_message" && parsed.message) {
        appendRoomMessage(parsed.message as Message);
      } else if (parsed.type === "bar_update") {
        setRoomBar({
          content: String(parsed.content || ""),
          label: String(parsed.label || "当前形势"),
          version: Number(parsed.version || 0),
        });
      } else if (parsed.type === "ask_pending") {
        void loadPendingAsk();
      } else if (parsed.type === "awaiting_user") {
        ctx.awaitingUser.current = true;
        stopTypewriter(tempId);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } else if (parsed.type === "final" && parsed.request_id) {
        ctx.finalRequestId.current = String(parsed.request_id);
      } else if (parsed.type === "tool_call_end") {
        void loadVariables();
      } else if (parsed.type === "error") {
        stopTypewriter(tempId);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      }
    },
    [appendRoomMessage, enqueue, stopTypewriter],
  );

  const consumeSseResponse = useCallback(
    async (response: Response, tempId: string) => {
      if (!response.ok || !response.body) {
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const finalRequestId = { current: null as string | null };
      const awaitingUser = { current: false };

      const processSSELine = (line: string) => {
        if (!line.startsWith("data:")) return;
        const payload = line.replace(/^data:\s*/, "");
        if (!payload) return;

        try {
          processSseEvent(JSON.parse(payload) as Record<string, unknown>, tempId, {
            finalRequestId,
            awaitingUser,
          });
        } catch {
          // ignore parse errors
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        events.forEach((ev) => processSSELine(ev.trim()));

        if (done) break;
      }

      if (buffer.trim()) {
        buffer.split("\n\n").forEach((ev) => processSSELine(ev.trim()));
      }

      if (awaitingUser.current) {
        return;
      }

      flush(tempId);
      if (finalRequestId.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? { ...msg, id: finalRequestId.current! } : msg,
          ),
        );
      }
    },
    [flush, processSseEvent],
  );

  const handleAISpeech = async (characterId: string) => {
    const targetCharacter = characters.find((c) => c.id === characterId);
    const tempId = `stream-${Date.now()}`;
    const placeholder: Message = {
      id: tempId,
      character_id: characterId,
      character_name: targetCharacter?.name || "AI",
      content: "",
      timestamp: new Date().toISOString(),
      is_system: false,
      sender_type: "ai",
    };

    setMessages((prev) => [...prev, placeholder]);

    try {
      const response = await api.streamAIResponse(characterId);
      await consumeSseResponse(response, tempId);
    } catch (error) {
      console.error("Error generating AI message:", error);
      stopTypewriter(tempId);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  };

  const handleAskSubmit = async (askId: string, answer: AskAnswer) => {
    setIsAskSubmitting(true);
    const characterId = pendingAsk?.character_id;
    try {
      await api.answerPendingAsk(askId, answer);
      setPendingAsk(null);

      if (!characterId) {
        return;
      }

      const targetCharacter = characters.find((c) => c.id === characterId);
      const tempId = `stream-resume-${Date.now()}`;
      const placeholder: Message = {
        id: tempId,
        character_id: characterId,
        character_name: targetCharacter?.name || "AI",
        content: "",
        timestamp: new Date().toISOString(),
        is_system: false,
        sender_type: "ai",
      };

      setMessages((prev) => [...prev, placeholder]);
      const response = await api.streamAIResponseResume(askId);
      await consumeSseResponse(response, tempId);
    } catch (error) {
      console.error("Failed to submit ask answer:", error);
    } finally {
      setIsAskSubmitting(false);
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
          roomVariables={roomVariables}
          globalVariables={globalVariables}
          isLoadingVariables={variablesLoading}
          onRefreshVariables={refreshVariables}
          onSetVariable={handleVariableSet}
          onAddVariable={handleVariableAdd}
          onIncVariable={handleVariableInc}
          onDecVariable={handleVariableDec}
          onDeleteVariable={handleVariableDelete}
          pendingAsk={pendingAsk}
          onAskSubmit={handleAskSubmit}
          isAskSubmitting={isAskSubmitting}
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
            {onlineUsers.length > 0 ? (
              <span className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
                [{onlineUsers.length} 人在场: {onlineUsers.map((user) => user.nickname || user.user_id).slice(0, 3).join(", ")}
                {onlineUsers.length > 3 ? " ..." : ""}
                ]
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                [无人连接]
              </span>
            )}
            {isRenaming ? (
              <div className="flex items-center gap-2 text-[12px]">
                <input
                  value={nicknameDraft}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleRename();
                    }
                    if (event.key === "Escape") {
                      setIsRenaming(false);
                      setNicknameDraft(normalizedNickname);
                    }
                  }}
                  onBlur={() => handleRename()}
                  className="w-28 rounded-sm border border-[var(--theme-border)] px-2 py-1 bg-white text-[var(--text)]"
                  autoFocus
                />
                <button
                  className="px-2 py-1 rounded-sm border border-[var(--theme-border)]"
                  onClick={() => {
                    void handleRename();
                  }}
                >
                  保存
                </button>
              </div>
            ) : (
              <button
                className="text-xs px-3 py-1 rounded-sm border border-[var(--theme-border)] hover:bg-white"
                onClick={() => {
                  setNicknameDraft(normalizedNickname);
                  setIsRenaming(true);
                }}
              >
                {normalizedNickname}
              </button>
            )}
            <ApiConfigDialog onSave={handleSaveApiConfig} />
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-700/70" : "bg-red-700/70"} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} title={isConnected ? "Connected" : "Disconnected"} />
          </div>

          <RoomStatusBar bar={roomBar} />

          <ChatMessageList messages={messages} characters={characters} />

          <ChatBottombar
            characters={characters}
            roomVariables={roomVariables}
            globalVariables={globalVariables}
            onSendMessage={handleSendMessage}
          />
        </main>
      </div>
    </div>
  );
}
