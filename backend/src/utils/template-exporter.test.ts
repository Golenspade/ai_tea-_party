import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("export-room-template script", () => {
  it("exports archive room data to a reusable template json", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ai-party-template-export-"));
    const archivePath = join(tempDir, "archive.json");
    const outputDir = join(tempDir, "template");
    const scriptPath = resolve(__dirname, "../../../scripts/export-room-template.mjs");

    const archive = {
      manifest: {
        schema_version: 1,
        archive_id: "archive-1",
        room_id: "room-1",
        title: "测试归档",
        created_at: "2026-06-09T00:00:00.000Z",
        message_count: 0,
        summary_count: 0,
        variable_count: 1,
        world_info_book_ids: ["book-1"],
      },
      room: {
        id: "room-1",
        name: "模板房间",
        description: "用于导出测试",
        stealth_mode: false,
        user_description: "",
        max_history: 50,
        characters: [
          {
            id: "char-1",
            name: "茶室主持",
            personality: "温和",
            background: "主持茶话会",
          },
        ],
      },
      room_variables: [{ name: "danger", value: 8, scope: "room" }],
      global_variables: [],
      room_bar: null,
      world_info_books: [
        {
          id: "book-1",
          name: "世界书",
          description: "",
          enabled: true,
          entries: [],
        },
      ],
      behavior_rules: [
        {
          id: "rule-1",
          room_id: "room-1",
          name: "高风险",
          enabled: true,
          priority: 10,
          conditions: [{ scope: "room", name: "danger", op: "gte", value: 8 }],
          condition_logic: "AND",
          prompt_text: "角色应优先自保。",
          created_at: "2026-06-09T00:00:00.000Z",
          updated_at: "2026-06-09T00:00:00.000Z",
        },
      ],
    };

    try {
      writeFileSync(archivePath, JSON.stringify(archive), "utf8");
      const output = execFileSync(process.execPath, [scriptPath, archivePath, outputDir], {
        encoding: "utf8",
      });
      assert.match(output, /template\.json/);

      const template = JSON.parse(readFileSync(join(outputDir, "template.json"), "utf8"));
      assert.equal(template.template_id, "room-1");
      assert.equal(template.rooms[0]?.characters[0]?.name, "茶室主持");
      assert.equal(template.rooms[0]?.world_info_books[0]?.name, "世界书");
      assert.equal(template.rooms[0]?.behavior_rules[0]?.prompt_text, "角色应优先自保。");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
