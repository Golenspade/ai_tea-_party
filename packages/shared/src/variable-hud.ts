import { z } from "zod";

export const VariablePolaritySchema = z.enum(["higher_is_worse", "higher_is_better"]);

export const VariableDisplaySchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  polarity: VariablePolaritySchema.optional(),
  show_in_hud: z.boolean().optional(),
  order: z.number().int().optional(),
  hint: z.string().optional(),
});

export const ResolvedVariableDisplaySchema = VariableDisplaySchema.extend({
  source: z.enum(["explicit", "inferred"]),
});

export const VariableHudResponseSchema = z.object({
  displays: z.array(ResolvedVariableDisplaySchema),
  values: z.record(z.unknown()),
});

export type VariablePolarity = z.infer<typeof VariablePolaritySchema>;
export type VariableDisplay = z.infer<typeof VariableDisplaySchema>;
export type ResolvedVariableDisplay = z.infer<typeof ResolvedVariableDisplaySchema>;
export type VariableHudResponse = z.infer<typeof VariableHudResponseSchema>;

export type VariableEntryLike = {
  name: string;
  value: unknown;
  scope?: "room" | "global";
};

const WORSE_NAME_RE = /danger|corruption|lust|堕落|淫|危险/i;

/** Spec §1.4 */
export function normalizeRatio(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}

function defaultPolarity(name: string): VariablePolarity {
  // Spec peer review: inference is conservative — only known "worse" names
  // get higher_is_worse; everything else defaults to higher_is_better.
  return WORSE_NAME_RE.test(name) ? "higher_is_worse" : "higher_is_better";
}

function defaultBounds(name: string, value: number): { min: number; max: number } {
  if (name.endsWith("_pct") || (value >= 0 && value <= 100)) {
    return { min: 0, max: 100 };
  }
  return { min: 0, max: Math.max(100, value) };
}

/** Spec §2.2 — infer a HUD display for undeclared numeric room variables. */
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

/**
 * Spec §2.2 — merge explicit `variable_displays` with inferred numeric room vars.
 * Explicit `show_in_hud: false` excludes a name from inference.
 */
export function resolveHudDisplays(
  explicit: VariableDisplay[],
  roomVariables: VariableEntryLike[],
): ResolvedVariableDisplay[] {
  const byName = new Map<string, ResolvedVariableDisplay>();
  const excluded = new Set<string>();
  const values = new Map(roomVariables.map((v) => [v.name, v.value]));

  for (const item of explicit) {
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

export function parseVariableDisplaysJson(raw: string | null | undefined): VariableDisplay[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = VariableDisplaySchema.array().safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}
