import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { AppRepository } from "./repository";

function withRepository(run: (repository: AppRepository) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-asks-"));
  process.env.DB_PATH = join(tempDir, "asks.db");

  try {
    const repository = new AppRepository();
    repository.createRoom("room-1", "测试房间");
    run(repository);
  } finally {
    delete process.env.DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createAsk(
  repository: AppRepository,
  id: string,
  createdAt: string,
) {
  return repository.createPendingAsk({
    id,
    roomId: "room-1",
    requestId: `req-${id}`,
    characterId: "char-1",
    toolCallId: `tool-${id}`,
    question: "请选择路线",
    choices: ["左", "右"],
    allowCustom: true,
    multiple: false,
    agentMessagesJson: JSON.stringify([{ role: "assistant", content: "question" }]),
    systemPrompt: "system prompt",
    provider: "openai",
    model: "gpt-4o-mini",
    createdAt,
  });
}

describe("AppRepository pending asks", () => {
  it("expires older pending asks in the same room when creating a new one", () => {
    withRepository((repository) => {
      const first = createAsk(repository, "ask-1", "2026-06-03T00:00:00.000Z");
      assert.equal(first.status, "pending");

      const second = createAsk(repository, "ask-2", "2026-06-03T00:01:00.000Z");
      assert.equal(second.status, "pending");

      const reloadedFirst = repository.getPendingAsk("ask-1");
      assert.equal(reloadedFirst?.status, "expired");
      assert.equal(reloadedFirst?.resolved_at, "2026-06-03T00:01:00.000Z");
      assert.equal(repository.getRoomPendingAsk("room-1")?.id, "ask-2");
    });
  });

  it("resolves a pending ask once and preserves resume metadata", () => {
    withRepository((repository) => {
      createAsk(repository, "ask-1", "2026-06-03T00:00:00.000Z");

      const resolved = repository.resolvePendingAsk(
        "ask-1",
        { selected: ["左"], custom: "慢慢走" },
        "2026-06-03T00:02:00.000Z",
      );

      assert.equal(resolved?.status, "resolved");
      assert.deepEqual(resolved?.answer, { selected: ["左"], custom: "慢慢走" });
      assert.equal(resolved?.agent_messages_json, JSON.stringify([{ role: "assistant", content: "question" }]));
      assert.equal(resolved?.system_prompt, "system prompt");
      assert.equal(resolved?.provider, "openai");
      assert.equal(resolved?.model, "gpt-4o-mini");
      assert.equal(repository.resolvePendingAsk("ask-1", { selected: ["右"] }, "later"), undefined);
    });
  });

  it("returns undefined for missing asks", () => {
    withRepository((repository) => {
      assert.equal(repository.getPendingAsk("missing"), undefined);
      assert.equal(repository.resolvePendingAsk("missing", { selected: ["左"] }, "now"), undefined);
    });
  });
});
