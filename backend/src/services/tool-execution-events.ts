import type { StreamingEvent } from "@ai-party/shared";

export interface ToolExecutionEventPayload {
  type?: string;
  toolCallId?: string;
  toolCall?: { name?: string; arguments?: Record<string, unknown> };
  args?: Record<string, unknown>;
  toolName?: string;
  result?: { content?: unknown; details?: Record<string, unknown> };
  partialResult?: { content?: unknown; details?: Record<string, unknown> } | Record<string, unknown>;
}

export interface ToolExecutionRunContext {
  requestId: string;
}

function normalizeToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  if (raw instanceof Map) {
    return Object.fromEntries(raw) as Record<string, unknown>;
  }

  return raw as Record<string, unknown>;
}

function resolveToolName(payload: ToolExecutionEventPayload): string {
  return payload.toolName || payload.toolCall?.name || payload.toolCallId || "tool";
}

export function mapToolExecutionToStreamingEvent(
  phase: "tool_execution_start" | "tool_execution_update" | "tool_execution_end",
  payload: ToolExecutionEventPayload,
  runContext: ToolExecutionRunContext,
): StreamingEvent {
  const toolName = resolveToolName(payload);

  if (phase === "tool_execution_start") {
    return {
      type: "tool_call_start",
      request_id: runContext.requestId,
      tool: toolName,
      args: normalizeToolArgs(payload.args || payload.toolCall?.arguments),
    };
  }

  if (phase === "tool_execution_update") {
    const partial = (payload.partialResult as { content?: unknown } | undefined)?.content;
    return {
      type: "tool_call_update",
      request_id: runContext.requestId,
      tool: toolName,
      progress:
        partial === undefined
          ? "processing"
          : typeof partial === "string"
            ? partial
            : JSON.stringify(partial),
    };
  }

  return {
    type: "tool_call_end",
    request_id: runContext.requestId,
    tool: toolName,
    output: normalizeToolArgs(payload.result),
  };
}
