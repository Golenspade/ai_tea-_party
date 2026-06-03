import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Character, WorldInfoBook } from "@ai-party/shared";

import {
  WorldInfoScanner,
  buildWorldInfoScanText,
  countActivatedEntries,
} from "./world-info-scanner.js";

describe("WorldInfoScanner", () => {
  it("activates keyword and constant entries", () => {
    const scanner = new WorldInfoScanner();
    const book: WorldInfoBook = {
      id: "book-1",
      name: "Test",
      description: "",
      enabled: true,
      entries: [
        {
          id: "entry-1",
          keys: ["hello"],
          secondary_keys: [],
          selective_logic: "AND",
          content: "Hello World",
          position: "after_char",
          depth: 4,
          enabled: true,
          constant: false,
          order: 100,
        },
        {
          id: "entry-2",
          keys: ["secret"],
          secondary_keys: [],
          selective_logic: "AND",
          content: "Always here",
          position: "system_top",
          depth: 4,
          enabled: true,
          constant: true,
          order: 100,
        },
      ],
    };

    const result = scanner.scan([book], "hello there");
    assert.equal(countActivatedEntries(result), 2);
    assert.equal(result.after_char[0]?.entry.content, "Hello World");
    assert.equal(result.system_top[0]?.entry.content, "Always here");
  });

  it("respects selective_logic NOT for secondary keys", () => {
    const scanner = new WorldInfoScanner();
    const book: WorldInfoBook = {
      id: "book-2",
      name: "Logic",
      description: "",
      enabled: true,
      entries: [
        {
          id: "entry-3",
          keys: ["dragon"],
          secondary_keys: ["fire"],
          selective_logic: "NOT",
          content: "Ice dragon lore",
          position: "before_char",
          depth: 4,
          enabled: true,
          constant: false,
          order: 10,
        },
      ],
    };

    const blocked = scanner.scan([book], "dragon breathes fire");
    assert.equal(countActivatedEntries(blocked), 0);

    const allowed = scanner.scan([book], "dragon lives in the mountains");
    assert.equal(countActivatedEntries(allowed), 1);
    assert.equal(allowed.before_char[0]?.entry.content, "Ice dragon lore");
  });

  it("builds scan text from character fields and recent chat", () => {
    const character = {
      id: "char-1",
      name: "X",
      personality: "calm",
      background: "scholar",
      description: "mentor",
      scenario: "library",
      creator_notes: "notes",
      is_active: true,
    } satisfies Character;

    const scanText = buildWorldInfoScanText(character, [
      {
        id: "m1",
        character_id: "user",
        character_name: "User",
        content: "hello world",
        timestamp: "2026-01-01T00:00:00.000Z",
        is_system: false,
      },
    ], "player persona");

    assert.match(scanText, /calm/);
    assert.match(scanText, /hello world/);
    assert.match(scanText, /player persona/);
  });
});
