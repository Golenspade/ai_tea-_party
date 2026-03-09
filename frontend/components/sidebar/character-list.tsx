"use client";

import type { Character } from "@/lib/types";
import { MessageCircle, Trash2 } from "lucide-react";

interface CharacterListProps {
  characters: Character[];
  onAISpeech: (characterId: string) => void;
  onDelete: (characterId: string) => void;
}

const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const getRoman = (index: number) => romanNumerals[index] || (index + 1).toString();

export function CharacterList({
  characters,
  onAISpeech,
  onDelete,
}: CharacterListProps) {
  return (
    <div className="space-y-1">
      {characters.map((character, index) => (
        <div key={character.id} className="group">
          <div className="px-4 py-3 rounded hover:bg-[#f1ede3] cursor-pointer flex flex-col hover-fade group-hover:text-[var(--theme-accent)]">
            <div className="flex justify-between items-center bg-transparent">
              <span className="font-book italic tracking-wide text-[var(--text)] group-hover:text-[var(--theme-accent)] transition-colors">
                {getRoman(index)}. {character.name}
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
      ))}
    </div>
  );
}
