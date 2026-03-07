"use client";

import type { Character } from "@/lib/types";
import { getAvatarColor, getCharacterInitials } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Trash2 } from "lucide-react";

interface CharacterListProps {
  characters: Character[];
  onAISpeech: (characterId: string) => void;
  onDelete: (characterId: string) => void;
}

export function CharacterList({
  characters,
  onAISpeech,
  onDelete,
}: CharacterListProps) {
  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-2">
        {characters.map((character, index) => (
          <Card key={character.id} className="group">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Avatar className={getAvatarColor(index)}>
                  <AvatarFallback className="text-white">
                    {getCharacterInitials(character.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{character.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {character.personality}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAISpeech(character.id)}
                  >
                    <MessageCircle className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(character.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
