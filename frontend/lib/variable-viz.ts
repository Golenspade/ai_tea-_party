/**
 * Variable HUD visualization helpers — Spec §1.4 / §2.2 / §5.2 / §5.4
 * Explicit VariableDisplay config lands with backend Phase 4.2; frontend
 * currently resolves via inference until GET /variable-hud exists.
 */

import type { VariableEntry } from "@/lib/types";

/** Mirrors Spec §2.1 VariableDisplaySchema (shared package arrives in backend PR). */
export type VariablePolarity = "higher_is_worse" | "higher_is_better";

export type VariableDisplay = {
  name: string;
  label?: string;
  min?: number;
  max?: number;
  polarity?: VariablePolarity;
  show_in_hud?: boolean;
  order?: number;
  hint?: string;
};

export type ResolvedVariableDisplay = VariableDisplay & {
  source: "explicit" | "inferred";
};

const WORSE_NAME_RE = /danger|corruption|lust|堕落|淫|危险/i;

export function normalizeRatio(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}

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

/** Spec §2.2 — default polarity (name heuristic; default remains higher_is_worse). */
function defaultPolarity(name: string): VariablePolarity {
  return WORSE_NAME_RE.test(name) ? "higher_is_worse" : "higher_is_worse";
}

function defaultBounds(name: string, value: number): { min: number; max: number } {
  if (name.endsWith("_pct") || (value >= 0 && value <= 100)) {
    return { min: 0, max: 100 };
  }
  return { min: 0, max: Math.max(100, value) };
}

export function inferVariableDisplay(
  name: string,
  value: unknown,
): ResolvedVariableDisplay | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const { min, max } = defaultBounds(name, value);
  return {
    name,
    label: name,
    min,
    max,
    polarity: defaultPolarity(name),
    show_in_hud: true,
    source: "inferred",
  };
}

export function resolveHudDisplays(
  explicit: VariableDisplay[],
  roomVariables: VariableEntry[],
): ResolvedVariableDisplay[] {
  const byName = new Map<string, ResolvedVariableDisplay>();
  const excluded = new Set<string>();
  const values = new Map(roomVariables.map((v) => [v.name, v.value]));

  for (const item of explicit) {
    // Spec §2.2 — explicit show_in_hud:false excludes the variable from HUD.
    if (item.show_in_hud === false) {
      excluded.add(item.name);
      continue;
    }
    const value = values.get(item.name);
    if (value === undefined) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    const bounds =
      typeof value === "number" ? defaultBounds(item.name, value) : { min: 0, max: 100 };
    byName.set(item.name, {
      name: item.name,
      label: item.label ?? item.name,
      min: item.min ?? bounds.min,
      max: item.max ?? bounds.max,
      polarity: item.polarity ?? defaultPolarity(item.name),
      show_in_hud: true,
      order: item.order,
      hint: item.hint,
      source: "explicit",
    });
  }

  for (const entry of roomVariables) {
    if (excluded.has(entry.name) || byName.has(entry.name)) continue;
    const inferred = inferVariableDisplay(entry.name, entry.value);
    if (inferred) byName.set(entry.name, inferred);
  }

  return [...byName.values()]
    .filter((d) => d.show_in_hud !== false)
    .sort(
      (a, b) =>
        (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name),
    );
}

export function isValueOutsideRange(
  value: number,
  min: number,
  max: number,
): boolean {
  return value < min || value > max;
}
