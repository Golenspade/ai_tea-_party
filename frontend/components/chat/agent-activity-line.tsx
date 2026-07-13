"use client";

import {
  getSessionActivityStatusLabel,
} from "@/lib/tool-activity";
import type { RoomActivityRecord } from "@/lib/room-activity-store";

interface AgentActivityLineProps {
  activity: RoomActivityRecord;
}

/**
 * Layer B — streaming footer status while the agent run is active.
 * Prefer tool label when available; otherwise fall back to status copy.
 */
export function AgentActivityLine({ activity }: AgentActivityLineProps) {
  const {
    runActive,
    status,
    currentToolLabel,
    characterName,
    toolSteps,
    hasVisibleOutput,
  } = activity;

  if (!runActive || status === "idle" || status === "awaiting_user") {
    return null;
  }

  // Layer A (card) owns the pre-output waiting surface.
  if (!hasVisibleOutput) {
    return null;
  }

  const label =
    currentToolLabel ||
    getSessionActivityStatusLabel(status, characterName);

  if (!label) {
    return null;
  }

  const lastStep = toolSteps.length > 0 ? toolSteps[toolSteps.length - 1] : null;
  const showStepHint =
    Boolean(lastStep?.endedAt) &&
    !currentToolLabel &&
    status !== "acting";

  return (
    <div
      data-testid="agent-activity-line"
      data-status={status}
      className="agent-activity-line flex flex-col gap-1.5 py-2 animate-in fade-in duration-300"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 text-xs tracking-wide text-[#7e766c]">
        <span className="agent-activity-pulse-ring relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--theme-accent)] opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--theme-accent)]" />
        </span>
        <span className="min-w-0 truncate font-sans">{label}</span>
      </div>
      {showStepHint && lastStep ? (
        <p
          data-testid="agent-activity-step-hint"
          className="pl-4 text-[10px] tracking-wide text-[#a39a8e] animate-in fade-in duration-500"
        >
          已完成 · {lastStep.label}
        </p>
      ) : null}
    </div>
  );
}
