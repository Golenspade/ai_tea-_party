import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadAppConfig, toCharacterFormData } from "./config-loader.js";

describe("config-loader", () => {
  it("loads rooms from a custom config path", () => {
    const dir = mkdtempSync(join(tmpdir(), "ai-party-config-"));
    const configPath = join(dir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        rooms: [
          {
            id: "lab",
            name: "测试房间",
            characters: [{ name: "助手", personality: "冷静" }],
          },
        ],
      }),
      "utf-8",
    );

    const config = loadAppConfig(configPath);
    assert.equal(config?.rooms?.[0]?.id, "lab");
    assert.equal(config?.rooms?.[0]?.characters?.[0]?.name, "助手");
  });

  it("maps config character fields to CharacterFormData", () => {
    const form = toCharacterFormData({
      name: "小明",
      personality: "开朗",
      background: "学生",
      speaking_style: "活泼",
    });

    assert.equal(form.name, "小明");
    assert.equal(form.personality, "开朗");
    assert.equal(form.background, "学生");
    assert.equal(form.speaking_style, "活泼");
  });
});
