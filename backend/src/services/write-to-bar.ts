export interface RoomBarSnapshot {
  room_id: string;
  content: string;
  label: string;
  version: number;
  updated_at: string;
}

export interface WriteToBarInput {
  content: string;
  label?: string;
}

const DEFAULT_BAR_LABEL = "当前形势";

export function parseWriteToBarInput(args: Record<string, unknown>): WriteToBarInput {
  if (typeof args.content !== "string") {
    throw new Error("content 不能为空");
  }

  const content = args.content.trim();
  if (!content) {
    throw new Error("content 不能为空");
  }

  const label =
    typeof args.label === "string" && args.label.trim() ? args.label.trim() : DEFAULT_BAR_LABEL;

  return { content, label };
}

export function buildRoomBarSnapshot(
  roomId: string,
  input: WriteToBarInput,
  previousVersion: number,
  now?: () => string,
): RoomBarSnapshot {
  return {
    room_id: roomId,
    content: input.content,
    label: input.label || DEFAULT_BAR_LABEL,
    version: previousVersion + 1,
    updated_at: now?.() ?? new Date().toISOString(),
  };
}
