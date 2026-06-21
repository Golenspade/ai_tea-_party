export interface PatchRoomInput {
  message_id: string;
  content: string;
  reason?: string;
}

export function parsePatchRoomInput(args: Record<string, unknown>): PatchRoomInput {
  if (typeof args.message_id !== "string") {
    throw new Error("message_id 不能为空");
  }

  const messageId = args.message_id.trim();
  if (!messageId) {
    throw new Error("message_id 不能为空");
  }

  if (typeof args.content !== "string") {
    throw new Error("content 不能为空");
  }

  const content = args.content.trim();
  if (!content) {
    throw new Error("content 不能为空");
  }

  const reason =
    typeof args.reason === "string" && args.reason.trim()
      ? args.reason.trim()
      : undefined;

  return {
    message_id: messageId,
    content,
    reason,
  };
}
