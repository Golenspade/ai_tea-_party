"use client";

import { useState, useCallback, useMemo } from "react";
import type {
  Character,
  Message,
  MessagePatch,
  DmNextSpeaker,
  CharacterFormData,
  ApiConfig,
  PresenceUser,
  PendingAskPublic,
  AskAnswer,
  RoomBarSnapshot,
  RoomArchiveRecord,
  RoomCompactResult,
  RoomSummary,
} from "@/lib/types";
import { RoomStatusBar } from "@/components/chat/room-status-bar";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTypewriter } from "@/hooks/use-typewriter";
import * as api from "@/services/api";
import { SidebarMain } from "@/components/sidebar/sidebar-main";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatBottombar } from "@/components/chat/chat-bottombar";
import { ApiConfigDialog } from "@/components/dialogs/api-config-dialog";
import { submitAskAndStartResume } from "@/services/ask-flow";
import { applyMessagePatch } from "@/services/message-patch";
import { useRoomActivityActions } from "@/hooks/use-room-activity";
import { useEffect } from "react";
import type {
  ActiveBranch,
  VariableEntry,
  VariablePatchRequest,
  VariableScope,
  VariableSetRequest,
} from "@/lib/types";

export function ChatLayout() {
  // --- 核心状态 ---
  const [characters, setCharacters] = useState<Character[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAutoChat, setIsAutoChat] = useState(false);
  const [roomVariables, setRoomVariables] = useState<VariableEntry[]>([]);
  const [globalVariables, setGlobalVariables] = useState<VariableEntry[]>([]);
  const [activeBranches, setActiveBranches] = useState<ActiveBranch[]>([]);
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
  const [summaries, setSummaries] = useState<RoomSummary[]>([]);
  const [archives, setArchives] = useState<RoomArchiveRecord[]>([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [lastCompactResult, setLastCompactResult] = useState<RoomCompactResult | null>(null);
  const [patchedMessageIds, setPatchedMessageIds] = useState<Set<string>>(new Set());
  const [dmNextSpeaker, setDmNextSpeaker] = useState<DmNextSpeaker | null>(null);
  const roomActivity = useRoomActivityActions("default");

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

  const handleMessagePatch = useCallback((patch: MessagePatch) => {
    setMessages((prev) => applyMessagePatch(prev, patch));
    setPatchedMessageIds((prev) => new Set(prev).add(patch.message_id));
    window.setTimeout(() => {
      setPatchedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(patch.message_id);
        return next;
      });
    }, 2400);
  }, []);

  const handleDmNextSpeaker = useCallback((choice: DmNextSpeaker) => {
    setDmNextSpeaker(choice);
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
    onMessagePatch: handleMessagePatch,
    onDmNextSpeaker: handleDmNextSpeaker,
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
      const [roomVars, globalVars, branches] = await Promise.all([
        api.fetchRoomVariables(),
        api.fetchGlobalVariables(),
        api.fetchActiveBranches(),
      ]);
      setRoomVariables(roomVars);
      setGlobalVariables(globalVars);
      setActiveBranches(branches);
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

  const loadArchiveState = async () => {
    setIsLoadingArchives(true);
    try {
      const [nextSummaries, nextArchives] = await Promise.all([
        api.fetchRoomSummaries(),
        api.fetchRoomArchives(),
      ]);
      setSummaries(nextSummaries);
      setArchives(nextArchives);
    } catch (error) {
      console.error("Failed to fetch archive state:", error);
    } finally {
      setIsLoadingArchives(false);
    }
  };

  useEffect(() => {
    loadCharacters();
    loadMessages();
    loadVariables();
    loadPresence();
    loadRoomBar();
    loadPendingAsk();
    loadArchiveState();
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

  const refreshArchiveState = () => {
    void loadArchiveState();
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
      const type = String(parsed.type || "");

      if (type === "delta" && typeof parsed.content === "string") {
        roomActivity.markVisibleOutput();
        enqueue(tempId, parsed.content);
      } else if (type === "room_message" && parsed.message) {
        roomActivity.markVisibleOutput();
        appendRoomMessage(parsed.message as Message);
        // Tool-written messages replace the empty stream placeholder.
        setMessages((prev) => {
          const placeholder = prev.find((msg) => msg.id === tempId);
          if (placeholder && !placeholder.content?.trim()) {
            return prev.filter((msg) => msg.id !== tempId);
          }
          return prev;
        });
      } else if (type === "message_patch" && parsed.patch) {
        roomActivity.markVisibleOutput();
        handleMessagePatch(parsed.patch as MessagePatch);
      } else if (type === "bar_update") {
        roomActivity.markVisibleOutput();
        setRoomBar({
          content: String(parsed.content || ""),
          label: String(parsed.label || "当前形势"),
          version: Number(parsed.version || 0),
        });
      } else if (type === "tool_call_start") {
        roomActivity.setTool(
          String(parsed.tool || "tool"),
          (parsed.args as Record<string, unknown>) || {},
        );
      } else if (type === "tool_call_update" && typeof parsed.tool === "string") {
        roomActivity.setToolProgress(
          parsed.tool,
          (parsed.progress as string | number) ?? "processing",
        );
      } else if (type === "tool_call_end") {
        roomActivity.clearTool();
        void loadVariables();
      } else if (type === "ask_pending") {
        void loadPendingAsk();
      } else if (type === "awaiting_user") {
        ctx.awaitingUser.current = true;
        roomActivity.setAwaitingUser();
        stopTypewriter(tempId);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      } else if (type === "final" && parsed.request_id) {
        ctx.finalRequestId.current = String(parsed.request_id);
        roomActivity.endRun();
      } else if (type === "error") {
        roomActivity.setError(String(parsed.message || "agent 执行出错"));
        stopTypewriter(tempId);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      }
    },
    [
      appendRoomMessage,
      enqueue,
      handleMessagePatch,
      roomActivity,
      stopTypewriter,
    ],
  );

  const consumeSseResponse = useCallback(
    async (response: Response, tempId: string) => {
      if (!response.ok || !response.body) {
        roomActivity.setError("生成失败，请重试");
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const finalRequestId = { current: null as string | null };
      const awaitingUser = { current: false };
      const errored = { current: false };

      const processSSELine = (line: string) => {
        if (!line.startsWith("data:")) return;
        const payload = line.replace(/^data:\s*/, "");
        if (!payload) return;

        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          if (parsed.type === "error") {
            errored.current = true;
          }
          processSseEvent(parsed, tempId, {
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

      if (awaitingUser.current || errored.current) {
        return;
      }

      if (!finalRequestId.current) {
        roomActivity.endRun();
      }

      flush(tempId);
      if (finalRequestId.current) {
        setMessages((prev) => {
          const placeholder = prev.find((msg) => msg.id === tempId);
          // Empty stream placeholders were only for optimistic UI — drop them.
          if (placeholder && !placeholder.content?.trim()) {
            return prev.filter((msg) => msg.id !== tempId);
          }
          return prev.map((msg) =>
            msg.id === tempId ? { ...msg, id: finalRequestId.current! } : msg,
          );
        });
      } else {
        setMessages((prev) => {
          const placeholder = prev.find((msg) => msg.id === tempId);
          if (placeholder && !placeholder.content?.trim()) {
            return prev.filter((msg) => msg.id !== tempId);
          }
          return prev;
        });
      }
    },
    [flush, processSseEvent, roomActivity],
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

    roomActivity.clearError();
    roomActivity.startRun({
      characterId,
      characterName: targetCharacter?.name || "AI",
    });
    setMessages((prev) => [...prev, placeholder]);

    try {
      const response = await api.streamAIResponse(characterId);
      await consumeSseResponse(response, tempId);
    } catch (error) {
      console.error("Error generating AI message:", error);
      roomActivity.setError("生成失败，请重试");
      stopTypewriter(tempId);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  };

  const handleDesignateNextSpeaker = async (characterId: string) => {
    try {
      const choice = await api.designateNextSpeaker(characterId);
      setDmNextSpeaker(choice);
    } catch (error) {
      console.error("Failed to designate next speaker:", error);
    }
  };

  const handleAskSubmit = async (askId: string, answer: AskAnswer) => {
    setIsAskSubmitting(true);
    const characterId = pendingAsk?.character_id;
    let tempId: string | null = null;
    try {
      if (!characterId) {
        await api.answerPendingAsk(askId, answer);
        setPendingAsk(null);
        return;
      }

      const targetCharacter = characters.find((c) => c.id === characterId);
      tempId = `stream-resume-${Date.now()}`;
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
      roomActivity.clearError();
      roomActivity.startRun({
        characterId,
        characterName: targetCharacter?.name || "AI",
      });
      const response = await submitAskAndStartResume(
        askId,
        answer,
        "default",
        undefined,
        () => setPendingAsk(null),
      );
      await consumeSseResponse(response, tempId);
    } catch (error) {
      console.error("Failed to submit ask answer:", error);
      roomActivity.setError("恢复生成失败，请重试");
      if (tempId) {
        stopTypewriter(tempId);
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      }
    } finally {
      setIsAskSubmitting(false);
    }
  };

  const handleCompactRoom = async (): Promise<void> => {
    setIsCompacting(true);
    try {
      const result = await api.compactRoom("default", { mode: "commit" });
      setLastCompactResult(result);
      await loadArchiveState();
    } catch (error) {
      console.error("Failed to compact room:", error);
    } finally {
      setIsCompacting(false);
    }
  };

  const handleCreateArchive = async (): Promise<void> => {
    setIsArchiving(true);
    try {
      await api.createRoomArchive("default");
      await loadArchiveState();
    } catch (error) {
      console.error("Failed to create archive:", error);
    } finally {
      setIsArchiving(false);
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
          onDesignateNextSpeaker={handleDesignateNextSpeaker}
          onDeleteCharacter={handleDeleteCharacter}
          onAddCharacter={handleAddCharacter}
          onStartAutoChat={handleStartAutoChat}
          onStopAutoChat={handleStopAutoChat}
          onClearMessages={handleClearMessages}
          roomVariables={roomVariables}
          globalVariables={globalVariables}
          activeBranches={activeBranches}
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
          summaries={summaries}
          archives={archives}
          isLoadingArchives={isLoadingArchives}
          isCompacting={isCompacting}
          isArchiving={isArchiving}
          lastCompactResult={lastCompactResult}
          onRefreshArchives={refreshArchiveState}
          onCompactRoom={handleCompactRoom}
          onCreateArchive={handleCreateArchive}
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
            {dmNextSpeaker && (
              <span className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
                [Next: {dmNextSpeaker.character_name}]
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

          <ChatMessageList
            messages={messages}
            characters={characters}
            patchedMessageIds={patchedMessageIds}
          />

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
