import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { VariableEntryLike } from "@ai-party/shared";

import {
  AGENT_TOOL_NAMES,
  ChatOrchestrator,
  type OrchestratorRuntime,
} from "./orchestrator.js";

type ToolLike = {
  name: string;
  execute: (toolCallId: string, args: Record<string, unknown>) => Promise<{
    content?: Array<{ type: string; text?: string }>;
    details?: Record<string, unknown>;
  }>;
};

function createMemoryRuntime(): {
  runtime: OrchestratorRuntime;
  room: Map<string, unknown>;
  global: Map<string, unknown>;
} {
  const room = new Map<string, unknown>();
  const global = new Map<string, unknown>();

  const toEntries = (scope: "room" | "global"): VariableEntryLike[] =>
    [...(scope === "room" ? room : global).entries()].map(([name, value]) => ({
      name,
      value,
      scope,
    }));

  const applyAdd = (previous: unknown, value: unknown): unknown => {
    if (previous === undefined || previous === null) return value;
    if (Array.isArray(previous)) {
      return [...previous, ...(Array.isArray(value) ? value : [value])];
    }
    if (typeof previous === "number" && typeof value === "number") return previous + value;
    if (typeof previous === "string" && typeof value === "string") return previous + value;
    return value;
  };

  const applyIncDec = (previous: unknown, delta: number, sign: 1 | -1): number => {
    const base = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
    return base + sign * delta;
  };

  const runtime: OrchestratorRuntime = {
    roomId: "room-test",
    provider: "deepseek",
    model: "deepseek-chat",
    getApiKey: () => undefined,
    speakingCharacterId: "char-1",
    speakingCharacterName: "测试角色",
    listRoomCharacters: () => [],
    writeToRoom: async () => {
      throw new Error("not used");
    },
    patchRoom: async () => {
      throw new Error("not used");
    },
    writeToBar: async () => {
      throw new Error("not used");
    },
    createPendingAsk: async () => {
      throw new Error("not used");
    },
    listRoomVariables: async () => toEntries("room"),
    listGlobalVariables: async () => toEntries("global"),
    setVariable: async (scope, name, value) => {
      const store = scope === "global" ? global : room;
      store.set(name, value);
      return { name, value, scope };
    },
    addVariable: async (scope, name, value) => {
      const store = scope === "global" ? global : room;
      const next = applyAdd(store.get(name), value);
      store.set(name, next);
      return { name, value: next, scope };
    },
    incVariable: async (scope, name, value) => {
      const store = scope === "global" ? global : room;
      const delta = typeof value === "number" ? value : 1;
      const next = applyIncDec(store.get(name), delta, 1);
      store.set(name, next);
      return { name, value: next, scope };
    },
    decVariable: async (scope, name, value) => {
      const store = scope === "global" ? global : room;
      const delta = typeof value === "number" ? value : 1;
      const next = applyIncDec(store.get(name), delta, -1);
      store.set(name, next);
      return { name, value: next, scope };
    },
    deleteVariable: async (scope, name) => {
      const store = scope === "global" ? global : room;
      return store.delete(name);
    },
    listRoomWorldInfoBooks: async () => [],
    listRoomSummaries: async () => [],
    listBehaviorRules: async () => [],
  };

  return { runtime, room, global };
}

describe("orchestrator variable tools", () => {
  it("exposes the full agent tool catalog including delete_variable", () => {
    const { runtime } = createMemoryRuntime();
    const orchestrator = new ChatOrchestrator();
    const tools = (
      orchestrator as unknown as {
        createTools: (runtime: OrchestratorRuntime, emit: (event: unknown) => void) => ToolLike[];
      }
    ).createTools(runtime, () => undefined);

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [...AGENT_TOOL_NAMES],
    );
    assert.ok(AGENT_TOOL_NAMES.includes("delete_variable"));
  });

  it("runs set / get / inc / dec / add / list / delete variable tools", async () => {
    const { runtime, room } = createMemoryRuntime();
    const orchestrator = new ChatOrchestrator();
    const tools = (
      orchestrator as unknown as {
        createTools: (runtime: OrchestratorRuntime, emit: (event: unknown) => void) => ToolLike[];
      }
    ).createTools(runtime, () => undefined);
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

    const setResult = await byName.set_variable.execute("tc-1", {
      name: "danger",
      value: 5,
    });
    assert.equal(setResult.details?.value, 5);
    assert.equal(room.get("danger"), 5);

    const getResult = await byName.get_variable.execute("tc-2", { name: "danger" });
    assert.equal(getResult.content?.[0]?.text, "5");
    assert.equal(getResult.details?.found, true);

    const incResult = await byName.inc_variable.execute("tc-3", {
      name: "danger",
      delta: 3,
    });
    assert.equal(incResult.details?.value, 8);

    const decResult = await byName.dec_variable.execute("tc-4", {
      name: "danger",
      delta: 1,
    });
    assert.equal(decResult.details?.value, 7);

    await byName.add_variable.execute("tc-5", {
      name: "tags",
      value: ["a"],
    });
    await byName.add_variable.execute("tc-6", {
      name: "tags",
      value: "b",
    });
    assert.deepEqual(room.get("tags"), ["a", "b"]);

    const listResult = await byName.list_variables.execute("tc-7", { scope: "room" });
    assert.equal(listResult.details?.count, 2);
    assert.match(listResult.content?.[0]?.text || "", /"danger":7/);

    const deleteResult = await byName.delete_variable.execute("tc-8", { name: "danger" });
    assert.equal(deleteResult.details?.deleted, true);
    assert.equal(room.has("danger"), false);

    const missing = await byName.delete_variable.execute("tc-9", { name: "danger" });
    assert.equal(missing.details?.deleted, false);

    await assert.rejects(
      () => byName.delete_variable.execute("tc-10", { name: "   " }),
      /变量名不能为空/,
    );
  });
});
