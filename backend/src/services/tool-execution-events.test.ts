import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapToolExecutionToStreamingEvent } from "./tool-execution-events";

describe("mapToolExecutionToStreamingEvent", () => {
  const runContext = { requestId: "req-1" };

  it("maps tool_execution_start", () => {
    const event = mapToolExecutionToStreamingEvent(
      "tool_execution_start",
      {
        toolName: "write_to_room",
        args: { content: "hello" },
      },
      runContext,
    );

    assert.deepEqual(event, {
      type: "tool_call_start",
      request_id: "req-1",
      tool: "write_to_room",
      args: { content: "hello" },
    });
  });

  it("maps tool_execution_update", () => {
    const event = mapToolExecutionToStreamingEvent(
      "tool_execution_update",
      {
        toolCall: { name: "patch_room" },
        partialResult: { content: "half" },
      },
      runContext,
    );

    assert.deepEqual(event, {
      type: "tool_call_update",
      request_id: "req-1",
      tool: "patch_room",
      progress: "half",
    });
  });

  it("maps tool_execution_end", () => {
    const event = mapToolExecutionToStreamingEvent(
      "tool_execution_end",
      {
        toolName: "ask_user",
        result: { details: { ok: true } },
      },
      runContext,
    );

    assert.deepEqual(event, {
      type: "tool_call_end",
      request_id: "req-1",
      tool: "ask_user",
      output: { details: { ok: true } },
    });
  });
});
