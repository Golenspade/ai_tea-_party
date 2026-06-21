import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
});
