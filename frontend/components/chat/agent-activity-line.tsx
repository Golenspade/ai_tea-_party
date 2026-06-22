"use client";

import {
  getSessionActivityStatusLabel,
} from "@/lib/tool-activity";
import type { RoomActivityRecord } from "@/lib/room-activity-store";

interface AgentActivityLineProps {
  activity: RoomActivityRecord;
}

export function AgentActivityLine({ activity }: AgentActivityLineProps) {
  const { runActive, status, currentToolLabel, characterName } = activity;

  if (!runActive || status === "idle" || status === "awaiting_user") {
    return null;
  }

  const label =
    currentToolLabel ||
    getSessionActivityStatusLabel(status, characterName);

  if (!label) {
    return null;
  }

  return (
    <div
      data-testid="agent-activity-line"
      className="flex items-center gap-2 text-xs tracking-wide text-[#7e766c] animate-pulse"
      aria-live="polite"
    >
      <span className="text-[var(--theme-accent)]" aria-hidden>
        ◌
      </span>
      <span>{label}</span>
    </div>
  );
}
