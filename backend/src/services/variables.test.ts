import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeVariableCommand,
  renderVariableMacros,
  resolveVariable,
  type VariableOps,
} from "./variables.js";

function createMemoryOps(roomId = "default"): { ops: VariableOps; room: Map<string, unknown>; global: Map<string, unknown> } {
  const room = new Map<string, unknown>();
  const global = new Map<string, unknown>();

  const ops: VariableOps = {
    roomId,
    listRoomVariables: () => Object.fromEntries(room),
    listGlobalVariables: () => Object.fromEntries(global),
    getRoomVariable: (name) => (room.has(name) ? room.get(name) : undefined),
    getGlobalVariable: (name) => (global.has(name) ? global.get(name) : undefined),
    roomVariableExists: (name) => room.has(name),
    globalVariableExists: (name) => global.has(name),
    setRoomVariable: (name, value) => {
      room.set(name, value);
    },
    setGlobalVariable: (name, value) => {
      global.set(name, value);
    },
    addRoomVariable: (name, value) => {
      const current = room.get(name);
      const next =
        typeof current === "number" && typeof value === "number"
          ? current + value
          : value;
      room.set(name, next);
      return next;
    },
    addGlobalVariable: (name, value) => {
      const current = global.get(name);
      const next =
        typeof current === "number" && typeof value === "number"
          ? current + value
          : value;
      global.set(name, next);
      return next;
    },
    incRoomVariable: (name, delta) => {
      const current = typeof room.get(name) === "number" ? (room.get(name) as number) : 0;
      const next = current + Number(delta);
      room.set(name, next);
      return next;
    },
    incGlobalVariable: (name, delta) => {
      const current = typeof global.get(name) === "number" ? (global.get(name) as number) : 0;
      const next = current + Number(delta);
      global.set(name, next);
      return next;
    },
    decRoomVariable: (name, delta) => {
      const current = typeof room.get(name) === "number" ? (room.get(name) as number) : 0;
      const next = current - Number(delta);
      room.set(name, next);
      return next;
    },
    decGlobalVariable: (name, delta) => {
      const current = typeof global.get(name) === "number" ? (global.get(name) as number) : 0;
      const next = current - Number(delta);
      global.set(name, next);
      return next;
    },
    deleteRoomVariable: (name) => {
      room.delete(name);
    },
    deleteGlobalVariable: (name) => {
      global.delete(name);
    },
  };

  return { ops, room, global };
}

describe("variables", () => {
  it("handles setvar and getvar command roundtrip", () => {
    const { ops } = createMemoryOps();

    const setResult = executeVariableCommand("/setvar score 100", ops);
    assert.equal(setResult.handled, true);
    assert.equal(setResult.output, "已设置变量 score");
    assert.equal(resolveVariable("score", ops), 100);

    const getResult = executeVariableCommand("/getvar score", ops);
    assert.equal(getResult.output, "100");
  });

  it("renders getvar macro for chat messages", () => {
    const { ops } = createMemoryOps();

    executeVariableCommand("/setvar tone neutral", ops);
    const rendered = renderVariableMacros("当前值 {{getvar::tone}}", ops);
    assert.equal(rendered, "当前值 neutral");
  });

  it("matches E2E smoke flow for numeric room variable", () => {
    const { ops } = createMemoryOps();
    const variableName = "smoke_e2e_demo";

    const setResult = executeVariableCommand(`/setvar ${variableName} 12`, ops);
    assert.equal(setResult.output, `已设置变量 ${variableName}`);

    const rendered = renderVariableMacros(`当前值 {{getvar::${variableName}}}`, ops);
    assert.equal(rendered, "当前值 12");
  });
});
