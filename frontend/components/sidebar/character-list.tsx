"use client";

import type { Character } from "@/lib/types";
import { MessageCircle, StepForward, Trash2 } from "lucide-react";
import { useRoomActivity } from "@/hooks/use-room-activity";
import type { RoomActivityStatus } from "@/lib/room-activity-store";

interface CharacterListProps {
  characters: Character[];
  onAISpeech: (characterId: string) => void;
  onDesignateNextSpeaker: (characterId: string) => void;
  onDelete: (characterId: string) => void;
}

const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const getRoman = (index: number) => romanNumerals[index] || (index + 1).toString();

function statusDotClass(status: RoomActivityStatus): string {
  if (status === "error") return "agent-activity-status-dot agent-activity-status-dot--error";
  if (status === "awaiting_user") {
    return "agent-activity-status-dot agent-activity-status-dot--awaiting";
  }
  return "agent-activity-status-dot";
}

function statusTitle(status: RoomActivityStatus): string {
  switch (status) {
    case "thinking":
      return "构思中";
    case "acting":
      return "行动中";
    case "streaming":
      return "落笔中";
    case "awaiting_user":
      return "等待抉择";
    case "error":
      return "本轮失败";
    default:
      return "活动中";
  }
}

export function CharacterList({
  characters,
  onAISpeech,
  onDesignateNextSpeaker,
  onDelete,
}: CharacterListProps) {
  const activity = useRoomActivity();

  return (
    <div className="space-y-1">
      {characters.map((character, index) => {
        const isActiveCharacter =
          activity.characterId === character.id &&
          (activity.runActive ||
            activity.status === "awaiting_user" ||
            activity.status === "error");

        return (
          <div key={character.id} className="group">
            <div className="px-4 py-3 rounded hover:bg-[#f1ede3] cursor-pointer flex flex-col hover-fade group-hover:text-[var(--theme-accent)]">
              <div className="flex justify-between items-center bg-transparent">
                <span className="font-book italic tracking-wide text-[var(--text)] group-hover:text-[var(--theme-accent)] transition-colors inline-flex items-center gap-2">
                  {getRoman(index)}. {character.name}
                  {isActiveCharacter ? (
                    <span
                      data-testid="character-activity-indicator"
                      data-character-id={character.id}
                      data-status={activity.status}
                      className={statusDotClass(activity.status)}
                      title={statusTitle(activity.status)}
                      aria-label={statusTitle(activity.status)}
                    />
                  ) : null}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="text-[#7e766c] hover:text-[var(--theme-accent)] transition-colors p-1 rounded"
                    onClick={(e) => { e.stopPropagation(); onAISpeech(character.id); }}
                    title="Speak"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-[#7e766c] hover:text-[var(--theme-accent)] transition-colors p-1 rounded"
                    onClick={(e) => { e.stopPropagation(); onDesignateNextSpeaker(character.id); }}
                    title="指定下轮"
                  >
                    <StepForward className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-[#7e766c] hover:text-red-700 transition-colors p-1 rounded"
                    onClick={(e) => { e.stopPropagation(); onDelete(character.id); }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {character.personality && (
                <p className="pl-6 pt-1 text-xs text-[#7e766c] font-sans truncate pr-8">
                  {character.personality}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
