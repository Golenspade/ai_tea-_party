"use client";

import {
  getSessionActivityStatusLabel,
} from "@/lib/tool-activity";
import type { RoomActivityRecord } from "@/lib/room-activity-store";

interface AgentActivityCardProps {
  activity: RoomActivityRecord;
}

/**
 * Layer A — waiting surface while a run is active but no narrative output yet.
 * Replaces the confusing empty stream bubble.
 */
export function AgentActivityCard({ activity }: AgentActivityCardProps) {
  const { runActive, status, hasVisibleOutput, currentToolLabel, characterName, errorMessage } =
    activity;

  if (status === "error" && errorMessage) {
    return (
      <div
        data-testid="agent-activity-card"
        data-status="error"
        className="agent-activity-card agent-activity-card--error mx-auto max-w-md rounded-sm border border-[#e8c4b8] bg-[#fff8f5] px-5 py-4 text-center animate-in fade-in duration-300"
        role="alert"
      >
        <p className="font-book text-sm text-[#a35d40]">{errorMessage}</p>
        <p className="mt-1 text-[11px] tracking-wide text-[#7e766c]">本轮生成失败，可再次点击 Speak 重试</p>
      </div>
    );
  }

  if (!runActive || status === "idle" || status === "awaiting_user" || hasVisibleOutput) {
    return null;
  }

  const label =
    currentToolLabel || getSessionActivityStatusLabel(status, characterName) || "Agent 正在构思…";

  return (
    <div
      data-testid="agent-activity-card"
      data-status={status}
      className="agent-activity-card mx-auto max-w-md rounded-sm border border-[var(--theme-border)] bg-[#fbf8f1]/90 px-5 py-5 text-center animate-in fade-in slide-in-from-bottom-1 duration-400"
      aria-live="polite"
    >
      <div className="agent-activity-ink mb-3 flex items-center justify-center gap-1.5" aria-hidden>
        <span className="agent-activity-ink-dot" />
        <span className="agent-activity-ink-dot agent-activity-ink-dot--delay-1" />
        <span className="agent-activity-ink-dot agent-activity-ink-dot--delay-2" />
      </div>
      {characterName ? (
        <p className="font-book italic text-base text-[#a35d40] tracking-wide">{characterName}</p>
      ) : null}
      <p className="mt-1 text-xs tracking-wide text-[#7e766c]">{label}</p>
    </div>
  );
}
