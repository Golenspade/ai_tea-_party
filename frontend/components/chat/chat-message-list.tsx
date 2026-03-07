"use client";

import { useEffect, useRef } from "react";
import type { Character, Message } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CustomChatBubble } from "@/components/chat/custom-chat-bubble";

interface ChatMessageListProps {
  messages: Message[];
  characters: Character[];
}

export function ChatMessageList({ messages, characters }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-4">
        {messages.map((message) => (
          <CustomChatBubble
            key={message.id}
            message={message}
            characters={characters}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
