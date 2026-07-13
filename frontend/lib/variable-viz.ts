/**
 * Variable HUD visualization helpers — Spec §5.2 / §5.4
 * Display resolution lives in `@ai-party/shared` (Phase 4.2).
 */

import type { VariablePolarity } from "@ai-party/shared";

export type {
  VariableDisplay,
  VariablePolarity,
  ResolvedVariableDisplay,
  VariableHudResponse,
} from "@ai-party/shared";

export {
  normalizeRatio,
  inferVariableDisplay,
  resolveHudDisplays,
} from "@ai-party/shared";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function interpolateHex(from: string, to: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ] as const;
  };
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  return toHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t));
}

const COLOR_LOW_WORSE = "#b8c9b0";
const COLOR_MID = "#a35d40";
const COLOR_HIGH_WORSE = "#c0392b";
const COLOR_LOW_BETTER = "#c0392b";
const COLOR_HIGH_BETTER = "#8fbc8f";

/** Spec §5.2 — continuous severity color on the client only. */
export function getVariableSeverityColor(
  ratio: number,
  polarity: VariablePolarity,
): string {
  const t = Math.min(1, Math.max(0, ratio));
  if (polarity === "higher_is_better") {
    if (t <= 0.5) return interpolateHex(COLOR_LOW_BETTER, COLOR_MID, t / 0.5);
    return interpolateHex(COLOR_MID, COLOR_HIGH_BETTER, (t - 0.5) / 0.5);
  }
  if (t <= 0.5) return interpolateHex(COLOR_LOW_WORSE, COLOR_MID, t / 0.5);
  return interpolateHex(COLOR_MID, COLOR_HIGH_WORSE, (t - 0.5) / 0.5);
}

export function isValueOutsideRange(
  value: number,
  min: number,
  max: number,
): boolean {
  return value < min || value > max;
}
