"use client";

import type {
  Character,
  CharacterFormData,
  VariableEntry,
  VariablePatchRequest,
  VariableScope,
  VariableSetRequest,
} from "@/lib/types";
import { CharacterList } from "@/components/sidebar/character-list";
import { RoomControls } from "@/components/sidebar/room-controls";
import { AddCharacterDialog } from "@/components/dialogs/add-character-dialog";
import { PersonaDialog } from "@/components/dialogs/persona-dialog";
import { WorldInfoDialog } from "@/components/dialogs/world-info-dialog";
import { VariablesPanel } from "@/components/sidebar/variables-panel";

interface SidebarMainProps {
  characters: Character[];
  isAutoChat: boolean;
  onAISpeech: (characterId: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  onAddCharacter: (data: CharacterFormData) => void;
  onStartAutoChat: () => void;
  onStopAutoChat: () => void;
  onClearMessages: () => void;
  roomVariables: VariableEntry[];
  globalVariables: VariableEntry[];
  isLoadingVariables: boolean;
  onRefreshVariables: () => void;
  onSetVariable: (scope: VariableScope, data: VariableSetRequest) => Promise<void>;
  onAddVariable: (scope: VariableScope, data: VariablePatchRequest) => Promise<void>;
  onIncVariable: (scope: VariableScope, data: VariablePatchRequest) => Promise<void>;
  onDecVariable: (scope: VariableScope, data: VariablePatchRequest) => Promise<void>;
  onDeleteVariable: (scope: VariableScope, name: string) => Promise<void>;
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
  roomVariables,
  globalVariables,
  isLoadingVariables,
  onRefreshVariables,
  onSetVariable,
  onAddVariable,
  onIncVariable,
  onDecVariable,
  onDeleteVariable,
}: SidebarMainProps) {
  return (
    <aside className="w-80 border-r border-[var(--theme-border)] flex flex-col pt-12 shrink-0 bg-[#fbf8f1] h-full z-10">
      <div className="px-10 pb-8 border-b border-[var(--theme-border)]">
        <h1 className="font-book text-2xl font-bold tracking-tight text-[var(--text)]">Index Rerum.</h1>
        <p className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] mt-2 font-semibold">Scholarly Chat</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* 角色管理 */}
        <div>
          <div className="flex items-center justify-between mb-3 px-2">
            <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
              Persōnae / Roles
            </h2>
            <AddCharacterDialog onAdd={onAddCharacter} />
          </div>
          <CharacterList
            characters={characters}
            onAISpeech={onAISpeech}
            onDelete={onDeleteCharacter}
          />
        </div>

        <div className="h-px bg-[var(--theme-border)] w-full opacity-50" />

        {/* 人设与世界观 */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold mb-3 px-2">
            Lore & Persona
          </h2>
          <div className="space-y-2 px-2">
            <PersonaDialog />
            <WorldInfoDialog />
          </div>
        </div>

        <div className="h-px bg-[var(--theme-border)] w-full opacity-50" />

        {/* 聊天控制 */}
        <RoomControls
          isAutoChat={isAutoChat}
          onStartAutoChat={onStartAutoChat}
          onStopAutoChat={onStopAutoChat}
          onClearMessages={onClearMessages}
        />

        <div className="h-px bg-[var(--theme-border)] w-full opacity-50" />

        <VariablesPanel
          roomVariables={roomVariables}
          globalVariables={globalVariables}
          loading={isLoadingVariables}
          onRefresh={onRefreshVariables}
          onSet={onSetVariable}
          onAdd={onAddVariable}
          onInc={onIncVariable}
          onDec={onDecVariable}
          onDelete={onDeleteVariable}
        />
      </div>
    </aside>
  );
}
