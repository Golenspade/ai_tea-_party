import { describe, expect, it } from "vitest";

import type { Message, MessagePatch } from "@/lib/types";
import { applyMessagePatch } from "./message-patch";

const messages: Message[] = [
  {
    id: "message-1",
    character_id: "char-1",
    character_name: "角色一",
    content: "旧正文",
    timestamp: "2026-06-09T00:00:00.000Z",
    is_system: false,
    sender_type: "ai",
  },
  {
    id: "message-2",
    character_id: "char-2",
    character_name: "角色二",
    content: "保持不变",
    timestamp: "2026-06-09T00:00:01.000Z",
    is_system: false,
    sender_type: "ai",
  },
];

const patch: MessagePatch = {
  room_id: "default",
  message_id: "message-1",
  content: "新正文",
  patched_at: "2026-06-09T00:00:02.000Z",
  reason: "修正",
};

describe("applyMessagePatch", () => {
  it("updates only the patched message content", () => {
    expect(applyMessagePatch(messages, patch)).toEqual([
      { ...messages[0], content: "新正文" },
      messages[1],
    ]);
  });

  it("keeps messages unchanged when the target is absent", () => {
    expect(applyMessagePatch(messages, { ...patch, message_id: "missing" })).toEqual(messages);
  });
});
