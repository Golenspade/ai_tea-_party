"use client";

import type { Character, CharacterFormData } from "@/lib/types";
import { CharacterList } from "@/components/sidebar/character-list";
import { RoomControls } from "@/components/sidebar/room-controls";
import { AddCharacterDialog } from "@/components/dialogs/add-character-dialog";
import { Separator } from "@/components/ui/separator";
import { Users } from "lucide-react";

interface SidebarMainProps {
  characters: Character[];
  isAutoChat: boolean;
  onAISpeech: (characterId: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  onAddCharacter: (data: CharacterFormData) => void;
  onStartAutoChat: () => void;
  onStopAutoChat: () => void;
  onClearMessages: () => void;
}

export function SidebarMain({
  characters,
  isAutoChat,
  onAISpeech,
  onDeleteCharacter,
  onAddCharacter,
  onStartAutoChat,
  onStopAutoChat,
  onClearMessages,
}: SidebarMainProps) {
  return (
    <aside className="w-80 border-r bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
      <div className="p-4 space-y-6">
        {/* 角色管理 */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users className="h-5 w-5" />
            角色管理
          </h2>
          <CharacterList
            characters={characters}
            onAISpeech={onAISpeech}
            onDelete={onDeleteCharacter}
          />
          <AddCharacterDialog onAdd={onAddCharacter} />
        </div>

        <Separator />

        {/* 聊天控制 */}
        <RoomControls
          isAutoChat={isAutoChat}
          onStartAutoChat={onStartAutoChat}
          onStopAutoChat={onStopAutoChat}
          onClearMessages={onClearMessages}
        />
      </div>
    </aside>
  );
}
