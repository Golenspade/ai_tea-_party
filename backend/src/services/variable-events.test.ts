import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildVariableUpdatePayload,
  computeDelta,
  isNoOpVariableChange,
} from "./variable-events.js";

describe("computeDelta", () => {
  it("returns numeric diff", () => {
    assert.equal(computeDelta(5, 8), 3);
  });

  it("returns undefined for non-numbers", () => {
    assert.equal(computeDelta("a", 8), undefined);
    assert.equal(computeDelta(5, NaN), undefined);
  });
});

describe("buildVariableUpdatePayload", () => {
  it("builds room inc payload with delta", () => {
    const payload = buildVariableUpdatePayload({
      roomId: "default",
      scope: "room",
      name: "corruption",
      op: "inc",
      previousValue: 2,
      value: 10,
    });
    assert.deepEqual(payload, {
      type: "variable_update",
      room_id: "default",
      scope: "room",
      name: "corruption",
      op: "inc",
      previous_value: 2,
      value: 10,
      delta: 8,
    });
  });

  it("omits delta when values are non-numeric", () => {
    const payload = buildVariableUpdatePayload({
      roomId: "default",
      scope: "room",
      name: "flag",
      op: "set",
      previousValue: "a",
      value: "b",
    });
    assert.equal(payload.delta, undefined);
  });
});

describe("isNoOpVariableChange", () => {
  it("detects identical primitives", () => {
    assert.equal(isNoOpVariableChange(5, 5), true);
    assert.equal(isNoOpVariableChange(5, 6), false);
  });
});
