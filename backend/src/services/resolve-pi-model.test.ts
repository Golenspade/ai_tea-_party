import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseEnvAiProvider,
  resolvePiModel,
  resolvePiModelId,
} from "./resolve-pi-model.js";

describe("resolvePiModel", () => {
  it("maps legacy deepseek-chat to pi-ai model", () => {
    assert.equal(resolvePiModelId("deepseek", "deepseek-chat"), "deepseek-v4-flash");
    const model = resolvePiModel("deepseek", "deepseek-chat");
    assert.ok(model);
    assert.notEqual(model.api, "unknown");
    assert.equal(model.id, "deepseek-v4-flash");
  });

  it("resolves gemini provider via google", () => {
    const model = resolvePiModel("gemini", "gemini-2.5-flash");
    assert.ok(model);
    assert.equal(model.provider, "google");
  });

  it("parses AI_PROVIDER env aliases", () => {
    assert.deepEqual(parseEnvAiProvider("deepseek_reasoner"), {
      provider: "deepseek",
      model: "deepseek-reasoner",
    });
  });

  it("returns null for empty or unknown AI_PROVIDER values", () => {
    assert.equal(parseEnvAiProvider(undefined), null);
    assert.equal(parseEnvAiProvider(""), null);
    assert.equal(parseEnvAiProvider("totally_unknown_provider"), null);
  });

  it("parses provider/model slash form", () => {
    // parseEnvAiProvider normalizes '-' → '_' before splitting.
    assert.deepEqual(parseEnvAiProvider("deepseek/deepseek-chat"), {
      provider: "deepseek",
      model: "deepseek_chat",
    });
  });
});
