"use client";

import { useState, useEffect } from "react";
import type { Character } from "@/lib/types";
import { type ResponseLength, fetchSettings, setResponseLength } from "@/services/api";

const LENGTH_OPTIONS: { value: ResponseLength; label: string; icon: string }[] = [
  { value: "short", label: "简短", icon: "📝" },
  { value: "default", label: "默认", icon: "💬" },
  { value: "long", label: "详细", icon: "📖" },
];

interface ChatBottombarProps {
  characters: Character[];
  onSendMessage: (characterId: string, content: string) => void;
}

export function ChatBottombar({ characters, onSendMessage }: ChatBottombarProps) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [responseLength, setLength] = useState<ResponseLength>("default");

  // 加载当前设置
  useEffect(() => {
    fetchSettings()
      .then((s) => setLength(s.response_length))
      .catch(() => {}); // 静默失败
  }, []);

  const handleSend = () => {
    if (!messageInput.trim() || !selectedCharacter) return;
    onSendMessage(selectedCharacter, messageInput);
    setMessageInput("");
  };

  const isVariableCommand = messageInput.trim().startsWith("/");
  const isVariableMacro = messageInput.includes("{{") && messageInput.includes("::");

  const handleLengthChange = async (length: ResponseLength) => {
    setLength(length);
    try {
      await setResponseLength(length);
    } catch (err) {
      console.error("Failed to update response length:", err);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 w-full p-4 sm:p-6 bg-gradient-to-t from-[#fdfaf5] via-[#fdfaf5]/90 to-transparent">
      <div className="max-w-3xl mx-auto flex flex-col gap-3 bg-white p-4 rounded-sm shadow-sm border border-[var(--theme-border)]">
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3 mb-1">
          <select 
            value={selectedCharacter}
            onChange={(e) => setSelectedCharacter(e.target.value)}
            className="bg-transparent text-sm font-book italic text-[var(--theme-accent)] outline-none cursor-pointer flex-1"
          >
            <option value="" disabled>Direct inquiry to...</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>

          {/* 回复长度选择器 */}
          <div className="flex items-center gap-0.5 ml-3 bg-[#f5f1ea] rounded-sm p-0.5">
            {LENGTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleLengthChange(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-sm transition-all ${
                  responseLength === opt.value
                    ? "bg-white shadow-sm text-[var(--theme-accent)] font-medium"
                    : "text-[var(--text)]/50 hover:text-[var(--text)]/80"
                }`}
                title={`回复长度: ${opt.label}`}
              >
                <span className="mr-1">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-end gap-2">
          <textarea
            placeholder="Type your inquiry here..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 resize-none bg-transparent outline-none text-sm font-sans leading-relaxed text-[var(--text)] placeholder:text-[var(--theme-accent)]/50 placeholder:italic min-h-[44px]"
            rows={2}
          />
          <button 
            onClick={handleSend}
            disabled={!selectedCharacter || !messageInput.trim()}
            className="text-xs uppercase tracking-[0.1em] font-bold text-[var(--theme-accent)] px-4 py-2 hover:bg-[#f1ede3] transition-colors disabled:opacity-50 disabled:hover:bg-transparent rounded-sm"
          >
            Submit
          </button>
        </div>
        {(isVariableCommand || isVariableMacro) && (
          <p className="text-[11px] text-[#7e766c] mt-2">
            支持变量命令：/setvar、/getvar、/addvar、/incvar、/decvar、/listvar、/flushvar
          </p>
        )}
      </div>
    </div>
  );
}
