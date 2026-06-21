import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { VariableCondition } from "@ai-party/shared";

import {
  evaluateVariableCondition,
  evaluateVariableConditions,
  normalizeConditionLogic,
  normalizeVariableConditions,
} from "./variable-conditions.js";

const context = {
  room: {
    danger: 7,
    mood: "tense",
    flags: ["torch", "key"],
    profile: { chapter: 2, route: "east" },
    zero: 0,
  },
  global: {
    chapter: "2",
  },
};

describe("variable conditions", () => {
  it("evaluates exists and truthy without treating missing variables as truthy", () => {
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "danger",
      op: "exists",
    }, context), true);
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "missing",
      op: "exists",
    }, context), false);
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "zero",
      op: "truthy",
    }, context), false);
  });

  it("does not trigger ne when the variable is missing", () => {
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "missing",
      op: "ne",
      value: "anything",
    }, context), false);
  });

  it("handles finite numeric comparisons and rejects NaN-like values", () => {
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "danger",
      op: "gte",
      value: "7",
    }, context), true);
    assert.equal(evaluateVariableCondition({
      scope: "global",
      name: "chapter",
      op: "gt",
      value: 1,
    }, context), true);
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "mood",
      op: "gt",
      value: 1,
    }, context), false);
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "danger",
      op: "lt",
      value: "NaN",
    }, context), false);
  });

  it("supports string includes, array includes, and stable object equality", () => {
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "mood",
      op: "includes",
      value: "ens",
    }, context), true);
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "flags",
      op: "includes",
      value: "key",
    }, context), true);
    assert.equal(evaluateVariableCondition({
      scope: "room",
      name: "profile",
      op: "eq",
      value: { route: "east", chapter: 2 },
    }, context), true);
  });

  it("combines multiple conditions with AND and OR", () => {
    const conditions: VariableCondition[] = [
      { scope: "room", name: "danger", op: "gt", value: 8 },
      { scope: "room", name: "flags", op: "includes", value: "torch" },
    ];

    assert.equal(evaluateVariableConditions(conditions, "AND", context), false);
    assert.equal(evaluateVariableConditions(conditions, "OR", context), true);
    assert.equal(evaluateVariableConditions([], "AND", context), true);
  });

  it("normalizes invalid condition payloads conservatively", () => {
    assert.equal(normalizeConditionLogic("OR"), "OR");
    assert.equal(normalizeConditionLogic("X"), "AND");
    assert.deepEqual(normalizeVariableConditions([
      { name: " danger ", op: "gte", value: 5 },
      { scope: "global", name: "chapter", op: "unknown" },
      { scope: "room", name: "  ", op: "exists" },
      null,
    ]), [
      { scope: "room", name: "danger", op: "gte", value: 5 },
      { scope: "global", name: "chapter", op: "exists" },
    ]);
  });
});
