import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRoomBarSnapshot, parseWriteToBarInput } from "./write-to-bar";

describe("write-to-bar", () => {
  it("parses write_to_bar args", () => {
    const parsed = parseWriteToBarInput({ content: "  夜已深  ", label: "场景" });
    assert.equal(parsed.content, "夜已深");
    assert.equal(parsed.label, "场景");
  });

  it("builds snapshot with incremented version", () => {
    const snap = buildRoomBarSnapshot(
      "room-1",
      { content: "summary" },
      2,
      () => "2026-06-03T00:00:00.000Z",
    );
    assert.equal(snap.version, 3);
    assert.equal(snap.room_id, "room-1");
  });
});
