import { describe, expect, it } from "vitest";

import {
  deriveVariableChangeEffects,
  formatDeltaText,
  isStrongVariableChange,
} from "./variable-change-effects";
import type { ResolvedVariableDisplay } from "./variable-viz";

const displays: ResolvedVariableDisplay[] = [
  {
    name: "danger",
    label: "危险",
    min: 0,
    max: 100,
    polarity: "higher_is_worse",
    show_in_hud: true,
    source: "explicit",
  },
  {
    name: "trust",
    label: "信任",
    min: 0,
    max: 100,
    polarity: "higher_is_better",
    show_in_hud: true,
    source: "explicit",
  },
];

describe("formatDeltaText", () => {
  it("formats signed deltas", () => {
    expect(formatDeltaText(3)).toBe("+3");
    expect(formatDeltaText(-2)).toBe("-2");
    expect(formatDeltaText(0)).toBe("");
    expect(formatDeltaText(undefined)).toBe("");
  });
});

describe("isStrongVariableChange", () => {
  it("treats |delta| >= 10 as strong", () => {
    expect(isStrongVariableChange(10, 0, 100)).toBe(true);
  });

  it("treats 10% of range as strong", () => {
    expect(isStrongVariableChange(5, 0, 50)).toBe(true);
    expect(isStrongVariableChange(4, 0, 50)).toBe(false);
  });
});

describe("deriveVariableChangeEffects", () => {
  it("ignores global and delete updates", () => {
    expect(
      deriveVariableChangeEffects(
        { scope: "global", name: "danger", delta: 3, op: "inc" },
        displays,
      ),
    ).toBeNull();
    expect(
      deriveVariableChangeEffects(
        { scope: "room", name: "danger", op: "delete" },
        displays,
      ),
    ).toBeNull();
  });

  it("builds toast and pulse for HUD variables", () => {
    const effects = deriveVariableChangeEffects(
      { scope: "room", name: "danger", delta: 3, op: "inc" },
      displays,
      1_000,
    );
    expect(effects?.toast).toMatchObject({
      name: "danger",
      label: "危险",
      deltaText: "+3",
      expiresAt: 2_500,
    });
    expect(effects?.pulseTarget).toBe("danger");
    expect(effects?.vignette).toBeNull();
  });

  it("adds worse vignette on strong rise for higher_is_worse", () => {
    const effects = deriveVariableChangeEffects(
      { scope: "room", name: "danger", delta: 12, op: "inc" },
      displays,
    );
    expect(effects?.vignette).toBe("worse");
  });

  it("adds better vignette on strong rise for higher_is_better", () => {
    const effects = deriveVariableChangeEffects(
      { scope: "room", name: "trust", delta: 12, op: "inc" },
      displays,
    );
    expect(effects?.vignette).toBe("better");
  });
});
