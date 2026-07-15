import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Agent } from "@earendil-works/pi-agent-core";
import { Type, type Model } from "@earendil-works/pi-ai";
import { getEnvApiKey, getModel, getModels } from "@earendil-works/pi-ai/compat";

import {
  APP_PROVIDER_TO_PI,
  resolvePiModel,
  resolvePiModelId,
  resolvePiProvider,
} from "./resolve-pi-model.js";
import {
  createPiGetApiKey,
  hasCredentialForAppProvider,
  resolveApiKeyForPiProvider,
} from "./pi-credentials.js";

/**
 * Boundary tests for the Pi 0.80 adapter surface:
 * - `/compat` still exports the globals we depend on
 * - unknown provider / unknown model / credential miss behave safely
 * - Agent still accepts getApiKey + Type schemas after the bump
 */
describe("Pi SDK 0.80 adapter boundary", () => {
  it("exposes getModel/getModels/getEnvApiKey from /compat", () => {
    assert.equal(typeof getModel, "function");
    assert.equal(typeof getModels, "function");
    assert.equal(typeof getEnvApiKey, "function");

    const model = getModel("deepseek", "deepseek-v4-flash" as never);
    assert.ok(model);
    assert.notEqual(model.api, "unknown");
    assert.ok(getModels("deepseek").length > 0);
  });

  it("maps every app provider we ship to a KnownProvider", () => {
    for (const [appProvider, piProvider] of Object.entries(APP_PROVIDER_TO_PI)) {
      assert.equal(resolvePiProvider(appProvider), piProvider);
      assert.ok(
        getModels(piProvider).length > 0,
        `expected catalog models for ${appProvider} → ${piProvider}`,
      );
    }
  });

  it("returns undefined for unknown app providers (no throw)", () => {
    assert.equal(resolvePiProvider("not-a-provider"), undefined);
    assert.equal(resolvePiModel("not-a-provider", "whatever"), undefined);
  });

  it("falls back to the first catalog model when id is unknown", () => {
    const fallback = resolvePiModel("deepseek", "definitely-not-a-real-model-id");
    assert.ok(fallback);
    assert.equal(fallback.provider, "deepseek");
    assert.notEqual(fallback.api, "unknown");
    // Should be the first registered deepseek model from /compat catalog.
    assert.equal(fallback.id, getModels("deepseek")[0]?.id);
  });

  it("uses raw model id when no alias exists", () => {
    assert.equal(resolvePiModelId("openai", "gpt-4o-mini"), "gpt-4o-mini");
    const model = resolvePiModel("openai", "gpt-4o-mini");
    assert.ok(model);
    assert.equal(model.id, "gpt-4o-mini");
  });

  it("resolves moonshot / minimax aliases through compat catalog", () => {
    assert.equal(resolvePiModelId("moonshot", "kimi-k2-instruct"), "kimi-k2-0905-preview");
    assert.equal(resolvePiModelId("minimax", "MiniMax-M2.1"), "MiniMax-M2.7");

    const moonshot = resolvePiModel("moonshot", "kimi-k2-instruct");
    assert.ok(moonshot);
    assert.equal(moonshot.provider, "moonshotai");
    assert.notEqual(moonshot.api, "unknown");

    const minimax = resolvePiModel("minimax", "MiniMax-M2.1");
    assert.ok(minimax);
    assert.notEqual(minimax.api, "unknown");
  });

  it("credential resolver prefers stored key, then allows miss without throwing", async () => {
    const stored = await resolveApiKeyForPiProvider("openai", {
      getStoredApiKey: () => "  sk-stored  ",
    });
    assert.equal(stored, "sk-stored");

    const missing = await resolveApiKeyForPiProvider("openai", {
      getStoredApiKey: () => "   ",
    });
    // May be undefined or an env key; must not throw.
    assert.ok(missing === undefined || typeof missing === "string");

    assert.equal(
      hasCredentialForAppProvider("not-a-provider", () => "sk"),
      false,
    );
  });

  it("createPiGetApiKey returns a function Agent can accept", async () => {
    const getApiKey = createPiGetApiKey({
      getStoredApiKey: () => "sk-boundary-test",
    });
    assert.equal(await getApiKey("deepseek"), "sk-boundary-test");

    const model = resolvePiModel("deepseek", "deepseek-chat") as Model<string>;
    assert.ok(model);

    const agent = new Agent({
      initialState: {
        systemPrompt: "boundary test",
        model,
        tools: [
          {
            name: "noop",
            label: "noop",
            description: "boundary noop",
            parameters: Type.Object({
              flag: Type.Optional(Type.Boolean()),
            }),
            execute: async () => ({
              content: [{ type: "text", text: "ok" }],
              details: {},
            }),
          },
        ],
        messages: [],
      },
      getApiKey,
    });

    assert.ok(agent);
    assert.equal(typeof agent.prompt, "function");
    assert.equal(typeof agent.waitForIdle, "function");
  });
});
