import { describe, expect, it } from "vitest";

import {
  getVariableSeverityColor,
  inferVariableDisplay,
  isValueOutsideRange,
  normalizeRatio,
  resolveHudDisplays,
} from "./variable-viz";

describe("normalizeRatio", () => {
  it("clamps overflow", () => {
    expect(normalizeRatio(120, 0, 100)).toBe(1);
  });

  it("clamps underflow", () => {
    expect(normalizeRatio(-5, 0, 100)).toBe(0);
  });

  it("returns 0 when max <= min", () => {
    expect(normalizeRatio(50, 100, 100)).toBe(0);
  });

  it("maps mid-range linearly", () => {
    expect(normalizeRatio(15, 0, 100)).toBe(0.15);
  });
});

describe("inferVariableDisplay", () => {
  it("infers numeric room variable", () => {
    expect(inferVariableDisplay("corruption", 0)).toMatchObject({
      name: "corruption",
      show_in_hud: true,
      min: 0,
      max: 100,
      polarity: "higher_is_worse",
    });
  });

  it("defaults non-worse names to higher_is_better", () => {
    expect(inferVariableDisplay("trust", 12)?.polarity).toBe("higher_is_better");
  });

  it("returns null for non-finite number", () => {
    expect(inferVariableDisplay("bad", NaN)).toBeNull();
  });

  it("returns null for non-number", () => {
    expect(inferVariableDisplay("flag", "on")).toBeNull();
  });
});

describe("resolveHudDisplays", () => {
  it("prefers explicit over inferred", () => {
    const result = resolveHudDisplays(
      [{ name: "danger", label: "危险", min: 0, max: 50 }],
      [{ name: "danger", value: 8, scope: "room" }],
    );
    expect(result[0]).toMatchObject({
      label: "危险",
      max: 50,
      source: "explicit",
    });
  });

  it("infers undeclared numeric room variables", () => {
    const result = resolveHudDisplays(
      [],
      [{ name: "danger", value: 12, scope: "room" }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "danger",
      source: "inferred",
      show_in_hud: true,
    });
  });

  it("honors show_in_hud false on explicit config", () => {
    const result = resolveHudDisplays(
      [{ name: "danger", show_in_hud: false }],
      [{ name: "danger", value: 8, scope: "room" }],
    );
    expect(result).toHaveLength(0);
  });
});

describe("getVariableSeverityColor", () => {
  it("returns mid accent near t=0.5 for higher_is_worse", () => {
    expect(getVariableSeverityColor(0.5, "higher_is_worse")).toBe("#a35d40");
  });
});

describe("isValueOutsideRange", () => {
  it("detects overflow and underflow", () => {
    expect(isValueOutsideRange(120, 0, 100)).toBe(true);
    expect(isValueOutsideRange(-1, 0, 100)).toBe(true);
    expect(isValueOutsideRange(50, 0, 100)).toBe(false);
  });
});
