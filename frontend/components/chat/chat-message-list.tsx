"use client";

import { useEffect, useRef } from "react";
import type { Character, Message } from "@/lib/types";
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
    <div className="flex-1 overflow-y-auto px-6 sm:px-12 pt-20 pb-40">
      <div className="space-y-12 max-w-3xl mx-auto">
        {/* Book chapter header */}
        <div className="mb-16 mt-8">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-[#7e766c] font-semibold mb-2">Literature Reviews</p>
          <div className="w-12 h-px bg-[var(--theme-accent)] mx-auto opacity-50"></div>
        </div>
        
        {messages.map((message) => (
          <CustomChatBubble
            key={message.id}
            message={message}
            characters={characters}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
