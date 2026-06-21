import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import AppState from "../store";

function withState(run: (state: AppState) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "ai-party-store-world-info-"));
  process.env.DB_PATH = join(tempDir, "store.db");

  try {
    const state = new AppState();
    run(state);
  } finally {
    delete process.env.DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("AppState world info conditions", () => {
  it("persists variable conditions and condition logic on entries", () => {
    withState((state) => {
      const book = state.createWorldInfoBook("条件世界书");

      state.upsertWorldInfoEntry(book.id, {
        id: "entry-conditions",
        keys: ["密室"],
        secondary_keys: [],
        selective_logic: "AND",
        content: "危险值足够时，密室门会打开。",
        position: "after_char",
        depth: 4,
        enabled: true,
        constant: false,
        order: 10,
        conditions: [
          { scope: "room", name: "danger", op: "gte", value: 5 },
          { scope: "global", name: "chapter", op: "eq", value: "phase-3" },
        ],
        condition_logic: "OR",
      });

      const saved = state.listWorldInfoBooks()[0]?.entries[0];
      assert.equal(saved?.condition_logic, "OR");
      assert.deepEqual(saved?.conditions, [
        { scope: "room", name: "danger", op: "gte", value: 5 },
        { scope: "global", name: "chapter", op: "eq", value: "phase-3" },
      ]);
    });
  });

  it("persists behavior rules and lists active branches from variables", () => {
    withState((state) => {
      state.createRoom("分支房间", "", { id: "room-1" });
      state.setVariable("room", "room-1", "danger", 9);

      const book = state.createWorldInfoBook("变量世界书");
      state.upsertWorldInfoEntry(book.id, {
        id: "entry-danger",
        keys: ["危险"],
        secondary_keys: [],
        selective_logic: "AND",
        content: "危险分支世界书内容。",
        position: "after_char",
        depth: 4,
        enabled: true,
        constant: false,
        order: 30,
        conditions: [{ scope: "room", name: "danger", op: "gte", value: 8 }],
        condition_logic: "AND",
      });
      state.setRoomWorldInfo("room-1", [book.id]);

      const rule = state.upsertBehaviorRule("room-1", {
        name: "高风险行为",
        priority: 10,
        conditions: [{ scope: "room", name: "danger", op: "gte", value: 8 }],
        condition_logic: "AND",
        prompt_text: "角色应优先自保。",
      });

      assert.equal(state.listBehaviorRules("room-1")[0]?.id, rule.id);

      const branches = state.listActiveBranches("room-1");
      assert.deepEqual(branches.map((branch) => branch.type), [
        "behavior_rule",
        "world_info",
      ]);
      assert.equal(branches[0]?.content, "角色应优先自保。");
      assert.equal(branches[1]?.content, "危险分支世界书内容。");
    });
  });
});
