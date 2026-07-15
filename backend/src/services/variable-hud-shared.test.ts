import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inferVariableDisplay,
  normalizeRatio,
  resolveHudDisplays,
} from "@ai-party/shared";

describe("shared variable-hud", () => {
  it("normalizes and clamps", () => {
    assert.equal(normalizeRatio(120, 0, 100), 1);
    assert.equal(normalizeRatio(-5, 0, 100), 0);
  });

  it("infers numeric displays", () => {
    const inferred = inferVariableDisplay("corruption", 0);
    assert.deepEqual(inferred, {
      name: "corruption",
      label: "corruption",
      min: 0,
      max: 100,
      polarity: "higher_is_worse",
      show_in_hud: true,
      source: "inferred",
    });
  });

  it("defaults non-worse names to higher_is_better", () => {
    const inferred = inferVariableDisplay("trust", 10);
    assert.equal(inferred?.polarity, "higher_is_better");
  });

  it("prefers explicit config", () => {
    const result = resolveHudDisplays(
      [{ name: "danger", label: "危险", min: 0, max: 50 }],
      [{ name: "danger", value: 8, scope: "room" }],
    );
    assert.equal(result[0]?.label, "危险");
    assert.equal(result[0]?.max, 50);
    assert.equal(result[0]?.source, "explicit");
  });
});
