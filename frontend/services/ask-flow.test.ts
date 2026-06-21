import { describe, expect, it, vi } from "vitest";

import { submitAskAndStartResume } from "./ask-flow";

describe("submitAskAndStartResume", () => {
  it("answers the ask before starting the resume stream", async () => {
    const calls: string[] = [];
    const response = new Response("ok");
    const client = {
      answerPendingAsk: vi.fn(async () => {
        calls.push("answer");
      }),
      streamAIResponseResume: vi.fn(async () => {
        calls.push("resume");
        return response;
      }),
    };

    const result = await submitAskAndStartResume(
      "ask-1",
      { selected: ["A"] },
      "room-1",
      client,
    );

    expect(result).toBe(response);
    expect(calls).toEqual(["answer", "resume"]);
    expect(client.answerPendingAsk).toHaveBeenCalledWith("ask-1", { selected: ["A"] }, "room-1");
    expect(client.streamAIResponseResume).toHaveBeenCalledWith("ask-1", "room-1");
  });

  it("runs the answered callback before starting resume", async () => {
    const calls: string[] = [];
    const client = {
      answerPendingAsk: vi.fn(async () => {
        calls.push("answer");
      }),
      streamAIResponseResume: vi.fn(async () => {
        calls.push("resume");
        return new Response("ok");
      }),
    };

    await submitAskAndStartResume(
      "ask-1",
      { selected: ["A"] },
      "room-1",
      client,
      () => calls.push("answered"),
    );

    expect(calls).toEqual(["answer", "answered", "resume"]);
  });

  it("does not start resume when answering fails", async () => {
    const onAnswered = vi.fn();
    const client = {
      answerPendingAsk: vi.fn(async () => {
        throw new Error("answer failed");
      }),
      streamAIResponseResume: vi.fn(async () => new Response("ok")),
    };

    await expect(
      submitAskAndStartResume("ask-1", { custom: "x" }, "room-1", client, onAnswered),
    ).rejects.toThrow("answer failed");
    expect(onAnswered).not.toHaveBeenCalled();
    expect(client.streamAIResponseResume).not.toHaveBeenCalled();
  });
});
