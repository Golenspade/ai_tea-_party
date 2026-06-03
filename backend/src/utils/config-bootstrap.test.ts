import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import type { CharacterFormData } from "@ai-party/shared";

import { AppRepository } from "../db/repository.js";
import { bootstrapRoomsFromConfig } from "./config-bootstrap.js";
import { resolveConfigPath } from "./config-loader.js";

describe("config bootstrap", () => {
  it("seeds preset rooms and characters from config.json on empty database", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ai-party-bootstrap-"));
    const dbPath = join(tempDir, "bootstrap.db");
    process.env.DB_PATH = dbPath;

    try {
      const repository = new AppRepository();
      assert.equal(repository.listRooms().length, 0);

      const createdAt = "2026-01-01T00:00:00.000Z";
      const createdRooms = new Map<string, CharacterFormData[]>();

      bootstrapRoomsFromConfig(
        {
          getRoom: (roomId) => repository.getRoom(roomId),
          createRoom: (name, description, options) => {
            repository.createRoom(options.id, name, description, options);
          },
          addCharacterToRoom: (roomId, data) => {
            const bucket = createdRooms.get(roomId) || [];
            bucket.push(data);
            createdRooms.set(roomId, bucket);

            repository.addCharacterToRoom(roomId, {
              id: `${roomId}-${data.name}`,
              name: data.name,
              personality: data.personality,
              background: data.background,
              description: data.description || "",
              scenario: data.scenario || "",
              speaking_style: data.speaking_style || "",
              system_prompt_override: "",
              post_instructions: "",
              greeting: "",
              creator_notes: "",
              tags: [],
              is_active: true,
              example_dialogues: [],
            });
          },
        },
        resolveConfigPath(resolve(process.cwd(), "..", "config.json")),
        () => createdAt,
      );

      const defaultRoom = repository.getRoom("default");
      assert.ok(defaultRoom);
      assert.ok(defaultRoom.characters.some((character) => character.name === "小明"));

      const philosophyRoom = repository.getRoom("philosophy");
      assert.ok(philosophyRoom);
      assert.ok(philosophyRoom.characters.some((character) => character.name === "苏格拉底"));
    } finally {
      delete process.env.DB_PATH;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
