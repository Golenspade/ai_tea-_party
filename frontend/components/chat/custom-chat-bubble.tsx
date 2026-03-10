"use client";

import type { Character, Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatBubbleProps {
  message: Message;
  characters: Character[];
}

export function CustomChatBubble({ message }: ChatBubbleProps) {
  if (message.is_system) {
    return (
      <div className="flex justify-center py-4">
        <span className="text-xs font-sans tracking-wide text-[#a35d40] px-4 py-1 border border-[#e6dec1] rounded-full bg-[#fbf8f1]">
          {message.content}
        </span>
      </div>
    );
  }

  // Treat as user message if ID is "user" or it doesn't match an AI character
  // Typically user messages come from the character selector, but let's assume default is user if missing
  const isUser = message.character_id === "user" || message.character_id === "SYSTEM" || message.character_name === "You" || message.character_name === "我";

  if (isUser) {
    return (
      <div className="pl-6 border-l border-[#e6dec1] ml-4 bg-[#fbf8f1] p-4 rounded-r-md shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs uppercase tracking-[0.1em] font-bold text-[#3b3631]">Inquiry /</span>
          <span className="text-xs text-[#7e766c]">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="text-sm font-sans leading-relaxed text-[#3b3631] whitespace-pre-wrap prose prose-sm max-w-none">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="group pt-2">
      <div className="flex items-center gap-3 mb-4">
        <span className="font-book italic tracking-wide text-lg text-[#a35d40]">{message.character_name}</span>
        <div className="h-px bg-[#e6dec1] flex-1"></div>
        <span className="text-xs text-[#7e766c] uppercase tracking-wider font-sans">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      
      <div className="font-book text-[1.05rem] leading-8 text-[#3b3631] text-justify">
        <div className="prose prose-sm md:prose-base lg:prose-lg max-w-none text-inherit leading-8 drop-cap marker:text-[#a35d40] prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:font-book prose-headings:text-[#3b3631]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
