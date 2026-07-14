import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appProviderForPiProvider,
  clearPiAgentAuthCache,
  credentialSettingKey,
  hasCredentialForAppProvider,
  resolveApiKeyForPiProvider,
} from "./pi-credentials";

describe("pi-credentials", () => {
  it("maps pi provider google to app provider gemini", () => {
    assert.equal(appProviderForPiProvider("google"), "gemini");
    assert.equal(appProviderForPiProvider("deepseek"), "deepseek");
  });

  it("uses stored api key before env", async () => {
    const key = await resolveApiKeyForPiProvider("deepseek", {
      getStoredApiKey: (provider) => (provider === "deepseek" ? "stored-key" : undefined),
    });
    assert.equal(key, "stored-key");
  });

  it("detects stored credentials for app provider", () => {
    assert.equal(
      hasCredentialForAppProvider("deepseek", () => "sk-test"),
      true,
    );
    assert.equal(
      hasCredentialForAppProvider("deepseek", () => undefined),
      Boolean(process.env.DEEPSEEK_API_KEY),
    );
  });

  it("treats whitespace-only stored key as missing and continues lookup", async () => {
    const previous = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const key = await resolveApiKeyForPiProvider("deepseek", {
        getStoredApiKey: () => "   ",
      });
      assert.equal(key, undefined);
      assert.equal(
        hasCredentialForAppProvider("deepseek", () => "   "),
        false,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previous;
      }
    }
  });

  it("reads env key when stored key is absent", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-from-env";
    try {
      const key = await resolveApiKeyForPiProvider("openai", {
        getStoredApiKey: () => undefined,
      });
      assert.equal(key, "sk-from-env");
      assert.equal(
        hasCredentialForAppProvider("openai", () => undefined),
        true,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previous;
      }
    }
  });

  it("builds stable credential setting keys", () => {
    assert.equal(credentialSettingKey("deepseek", "api_key"), "cred:deepseek:api_key");
  });

  it("can clear pi auth cache", () => {
    clearPiAgentAuthCache();
    assert.ok(true);
  });
});
