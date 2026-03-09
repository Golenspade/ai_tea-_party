"use client";

import { useState } from "react";
import type { Character } from "@/lib/types";

interface ChatBottombarProps {
  characters: Character[];
  onSendMessage: (characterId: string, content: string) => void;
}

export function ChatBottombar({ characters, onSendMessage }: ChatBottombarProps) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const handleSend = () => {
    if (!messageInput.trim() || !selectedCharacter) return;
    onSendMessage(selectedCharacter, messageInput);
    setMessageInput("");
  };

  return (
    <div className="absolute bottom-0 left-0 w-full p-4 sm:p-6 bg-gradient-to-t from-[#fdfaf5] via-[#fdfaf5]/90 to-transparent">
      <div className="max-w-3xl mx-auto flex flex-col gap-3 bg-white p-4 rounded-sm shadow-sm border border-[var(--theme-border)]">
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3 mb-1">
          <select 
            value={selectedCharacter}
            onChange={(e) => setSelectedCharacter(e.target.value)}
            className="bg-transparent text-sm font-book italic text-[var(--theme-accent)] outline-none cursor-pointer w-full"
          >
            <option value="" disabled>Direct inquiry to...</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
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
      </div>
    </div>
  );
}
