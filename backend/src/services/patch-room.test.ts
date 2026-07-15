import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MessagePatchSchema } from "@ai-party/shared";

import { parsePatchRoomInput } from "./patch-room";

describe("patch-room", () => {
  it("parses patch_room args", () => {
    const parsed = parsePatchRoomInput({
      message_id: " message-1 ",
      content: "  修订后的正文  ",
      reason: "  去重  ",
    });

    assert.deepEqual(parsed, {
      message_id: "message-1",
      content: "修订后的正文",
      reason: "去重",
    });
  });

  it("rejects missing message_id", () => {
    assert.throws(() => parsePatchRoomInput({ content: "正文" }), /message_id/);
    assert.throws(() => parsePatchRoomInput({ message_id: " ", content: "正文" }), /message_id/);
  });

  it("rejects empty content", () => {
    assert.throws(() => parsePatchRoomInput({ message_id: "message-1" }), /content/);
    assert.throws(() => parsePatchRoomInput({ message_id: "message-1", content: " " }), /content/);
  });

  it("accepts MessagePatch payloads with previous_content", () => {
    const parsed = MessagePatchSchema.parse({
      room_id: "default",
      message_id: "message-1",
      content: "新正文",
      previous_content: "旧正文",
      patched_at: "2026-07-15T00:00:00.000Z",
      reason: "修正",
    });

    assert.equal(parsed.previous_content, "旧正文");
    assert.equal(parsed.content, "新正文");
  });

  it("keeps previous_content optional for backward compatibility", () => {
    const parsed = MessagePatchSchema.parse({
      room_id: "default",
      message_id: "message-1",
      content: "新正文",
      patched_at: "2026-07-15T00:00:00.000Z",
    });

    assert.equal(parsed.previous_content, undefined);
  });
});
