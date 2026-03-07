"use client";

import { useState } from "react";
import type { Character } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send } from "lucide-react";

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
    <div className="border-t p-4">
      <div className="flex gap-2">
        <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="选择角色..." />
          </SelectTrigger>
          <SelectContent>
            {characters.map((character) => (
              <SelectItem key={character.id} value={character.id}>
                {character.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="输入消息..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!selectedCharacter}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
