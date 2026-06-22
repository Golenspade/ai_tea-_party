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

  it("builds stable credential setting keys", () => {
    assert.equal(credentialSettingKey("deepseek", "api_key"), "cred:deepseek:api_key");
  });

  it("can clear pi auth cache", () => {
    clearPiAgentAuthCache();
    assert.ok(true);
  });
});
