"use client";

import { useEffect, useRef } from "react";
import type { Character, Message } from "@/lib/types";
import { CustomChatBubble } from "@/components/chat/custom-chat-bubble";
import { AgentActivityCard } from "@/components/chat/agent-activity-card";
import { AgentActivityLine } from "@/components/chat/agent-activity-line";
import { useRoomActivity } from "@/hooks/use-room-activity";
import type { ParagraphDiffOp } from "@/services/paragraph-diff";

interface ChatMessageListProps {
  messages: Message[];
  characters: Character[];
  patchedMessageIds?: Set<string>;
  paragraphDiffs?: Map<string, ParagraphDiffOp[]>;
}

function isEmptyStreamPlaceholder(message: Message): boolean {
  return (
    typeof message.id === "string" &&
    message.id.startsWith("stream-") &&
    !message.content?.trim()
  );
}

export function ChatMessageList({
  messages,
  characters,
  patchedMessageIds,
  paragraphDiffs,
}: ChatMessageListProps) {
  const activity = useRoomActivity();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity.updatedAt, activity.currentToolLabel, activity.status]);

  const visibleMessages = messages.filter((message) => !isEmptyStreamPlaceholder(message));

  return (
    <div className="flex-1 overflow-y-auto px-6 sm:px-12 pt-20 pb-40">
      <div className="space-y-12 max-w-3xl mx-auto">
        {/* Book chapter header */}
        <div className="mb-16 mt-8">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-[#7e766c] font-semibold mb-2">Literature Reviews</p>
          <div className="w-12 h-px bg-[var(--theme-accent)] mx-auto opacity-50"></div>
        </div>
        
        {visibleMessages.map((message) => (
          <CustomChatBubble
            key={message.id}
            message={message}
            characters={characters}
            isPatched={patchedMessageIds?.has(message.id)}
            paragraphDiff={paragraphDiffs?.get(message.id)}
          />
        ))}
        <AgentActivityCard activity={activity} />
        <AgentActivityLine activity={activity} />
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
