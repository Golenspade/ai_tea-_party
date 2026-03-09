"use client";

import { Play, Square, Trash2 } from "lucide-react";

interface RoomControlsProps {
  isAutoChat: boolean;
  onStartAutoChat: () => void;
  onStopAutoChat: () => void;
  onClearMessages: () => void;
}

export function RoomControls({
  isAutoChat,
  onStartAutoChat,
  onStopAutoChat,
  onClearMessages,
}: RoomControlsProps) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold mb-3 px-2">Actions</h2>
      <div className="space-y-2 px-2">
        {!isAutoChat ? (
          <button 
            className="w-full px-4 py-3 rounded text-left border border-[var(--theme-border)] bg-white text-[var(--theme-accent)] font-book italic tracking-wide hover:bg-[#f1ede3] transition-colors flex items-center justify-center gap-2 shadow-sm"
            onClick={onStartAutoChat}
          >
            <Play className="h-4 w-4" />
            Commence Auto-Dialogue
          </button>
        ) : (
          <button
            className="w-full px-4 py-3 rounded text-left border border-[var(--theme-accent)] bg-[#f1ede3] text-[var(--theme-accent)] font-book italic tracking-wide transition-colors flex items-center justify-center gap-2 shadow-sm shadow-[var(--theme-accent)]/20"
            onClick={onStopAutoChat}
          >
            <Square className="h-4 w-4" />
            Halt Dialogue
          </button>
        )}
        <button 
          className="w-full px-4 py-3 rounded text-left text-[#7e766c] text-sm hover:text-[var(--theme-accent)] transition-colors flex items-center justify-center gap-2 mt-2"
          onClick={onClearMessages}
        >
          <Trash2 className="h-4 w-4" />
          Expunge Records
        </button>
      </div>
    </div>
  );
}
