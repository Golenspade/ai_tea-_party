import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Message, RoomSummary } from "@ai-party/shared";

import {
  buildDeterministicSummary,
  createDeterministicRoomSummary,
  selectCompactionRange,
} from "./summary-compact";

function makeMessage(index: number, senderType: Message["sender_type"] = "ai"): Message {
  return {
    id: `message-${index}`,
    character_id: senderType === "user" ? "user" : "char-1",
    character_name: senderType === "user" ? "访客" : "主持",
    content: `第 ${index} 条消息`,
    timestamp: `2026-06-09T00:00:${String(index).padStart(2, "0")}.000Z`,
    is_system: senderType === "system",
    sender_type: senderType,
  };
}

function makeSummary(endMessageId: string): RoomSummary {
  return {
    id: "summary-1",
    room_id: "room-1",
    start_message_id: "message-1",
    end_message_id: endMessageId,
    message_count: 2,
    summary: "旧摘要",
    source: "deterministic",
    created_at: "2026-06-09T00:01:00.000Z",
  };
}

describe("summary compact", () => {
  it("selects messages before the retained recent tail", () => {
    const messages = [1, 2, 3, 4, 5].map((index) => makeMessage(index));

    const selection = selectCompactionRange(messages, { keepRecent: 2 });

    assert.equal(selection.keepRecent, 2);
    assert.equal(selection.range?.start_message_id, "message-1");
    assert.equal(selection.range?.end_message_id, "message-3");
    assert.equal(selection.range?.message_count, 3);
    assert.deepEqual(selection.messages.map((message) => message.id), [
      "message-1",
      "message-2",
      "message-3",
    ]);
  });

  it("continues after the latest existing summary", () => {
    const messages = [1, 2, 3, 4, 5, 6].map((index) => makeMessage(index));

    const selection = selectCompactionRange(messages, {
      keepRecent: 2,
      existingSummaries: [makeSummary("message-2")],
    });

    assert.deepEqual(selection.messages.map((message) => message.id), [
      "message-3",
      "message-4",
    ]);
    assert.equal(selection.range?.start_message_id, "message-3");
    assert.equal(selection.range?.end_message_id, "message-4");
  });

  it("returns no-op when there is no room beyond the recent tail", () => {
    const messages = [1, 2].map((index) => makeMessage(index));

    const selection = selectCompactionRange(messages, { keepRecent: 2 });

    assert.equal(selection.messages.length, 0);
    assert.equal(selection.range, undefined);
    assert.match(selection.reason || "", /保留窗口/);
  });

  it("builds deterministic summaries for user, ai, and system messages", () => {
    const messages = [
      makeMessage(1, "user"),
      makeMessage(2, "ai"),
      makeMessage(3, "system"),
    ];

    const summary = buildDeterministicSummary(messages);

    assert.match(summary, /共 3 条消息/);
    assert.match(summary, /\[访客\/user\] 第 1 条消息/);
    assert.match(summary, /\[主持\/ai\] 第 2 条消息/);
    assert.match(summary, /\[系统\/system\] 第 3 条消息/);
  });

  it("creates a persisted summary payload from selected messages", () => {
    const messages = [1, 2, 3].map((index) => makeMessage(index));

    const summary = createDeterministicRoomSummary({
      id: "summary-1",
      roomId: "room-1",
      messages,
      createdAt: "2026-06-09T00:02:00.000Z",
    });

    assert.equal(summary.start_message_id, "message-1");
    assert.equal(summary.end_message_id, "message-3");
    assert.equal(summary.message_count, 3);
    assert.equal(summary.source, "deterministic");
    assert.match(summary.summary, /第 2 条消息/);
  });
});
