"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface RoomBarState {
  content: string;
  label: string;
  version: number;
}

interface RoomStatusBarProps {
  bar: RoomBarState | null;
}

export function RoomStatusBar({ bar }: RoomStatusBarProps) {
  if (!bar || !bar.content.trim()) {
    return null;
  }

  return (
    <div
      key={bar.version}
      className="mx-8 mt-20 mb-2 px-4 py-3 border border-[#e6dec1] rounded-sm bg-[#fbf8f1] animate-in fade-in duration-300"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#a35d40] font-semibold mb-1">
        {bar.label}
      </p>
      <div className="text-xs text-[#3b3631] leading-relaxed prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{bar.content}</ReactMarkdown>
      </div>
    </div>
  );
}
