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

  it("gates keyword and constant entries with variable conditions", () => {
    const scanner = new WorldInfoScanner();
    const book: WorldInfoBook = {
      id: "book-conditions",
      name: "Conditions",
      description: "",
      enabled: true,
      entries: [
        {
          id: "entry-keyword",
          keys: ["vault"],
          secondary_keys: [],
          selective_logic: "AND",
          content: "Vault opens at high danger",
          position: "after_char",
          depth: 4,
          enabled: true,
          constant: false,
          order: 10,
          conditions: [{ scope: "room", name: "danger", op: "gte", value: 5 }],
          condition_logic: "AND",
        },
        {
          id: "entry-constant",
          keys: [],
          secondary_keys: [],
          selective_logic: "AND",
          content: "Torch route is always available",
          position: "system_top",
          depth: 4,
          enabled: true,
          constant: true,
          order: 20,
          conditions: [{ scope: "room", name: "flags", op: "includes", value: "torch" }],
          condition_logic: "AND",
        },
        {
          id: "entry-blocked",
          keys: ["vault"],
          secondary_keys: [],
          selective_logic: "AND",
          content: "This branch should stay hidden",
          position: "system_bottom",
          depth: 4,
          enabled: true,
          constant: true,
          order: 30,
          conditions: [{ scope: "room", name: "missing", op: "ne", value: "x" }],
          condition_logic: "AND",
        },
      ],
    };

    const blocked = scanner.scan([book], "vault", {
      variableContext: { room: { danger: 4, flags: [] }, global: {} },
    });
    assert.equal(countActivatedEntries(blocked), 0);

    const allowed = scanner.scan([book], "vault", {
      variableContext: { room: { danger: 7, flags: ["torch"] }, global: {} },
    });
    assert.equal(countActivatedEntries(allowed), 2);
    assert.equal(allowed.after_char[0]?.entry.content, "Vault opens at high danger");
    assert.equal(allowed.system_top[0]?.entry.content, "Torch route is always available");
    assert.equal(allowed.system_bottom.length, 0);
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
