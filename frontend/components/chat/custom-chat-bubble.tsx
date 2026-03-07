"use client";

import type { Character, Message } from "@/lib/types";
import { getAvatarColor, getCharacterInitials } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ChatBubbleProps {
  message: Message;
  characters: Character[];
}

export function CustomChatBubble({ message, characters }: ChatBubbleProps) {
  const characterIndex = characters.findIndex(
    (c) => c.id === message.character_id,
  );

  if (message.is_system) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar className={getAvatarColor(characterIndex)}>
        <AvatarFallback className="text-white">
          {getCharacterInitials(message.character_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{message.character_name}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p className="mt-1 text-sm">{message.content}</p>
      </div>
    </div>
  );
}
