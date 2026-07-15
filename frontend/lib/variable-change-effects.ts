import type { ResolvedVariableDisplay, VariableUpdatePayload } from "@ai-party/shared";

export interface VariableChangeToastItem {
  id: string;
  name: string;
  label: string;
  deltaText: string;
  polarity: "higher_is_worse" | "higher_is_better";
  expiresAt: number;
}

export interface VariableChangeEffects {
  toast: VariableChangeToastItem | null;
  pulseTarget: string | null;
  vignette: "worse" | "better" | null;
}

const TOAST_TTL_MS = 1500;
const PULSE_TTL_MS = 200;
const VIGNETTE_TTL_MS = 800;

/** Spec §5.3 — strong change when |delta| >= 10 or >= 10% of range. */
export function isStrongVariableChange(
  delta: number,
  min: number,
  max: number,
): boolean {
  const abs = Math.abs(delta);
  if (abs >= 10) return true;
  const span = max - min;
  if (span <= 0) return false;
  return abs >= 0.1 * span;
}

export function formatDeltaText(delta: number | undefined): string {
  if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) {
    return "";
  }
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * Spec §5.3 — derive toast / pulse / vignette from a room-scope variable_update.
 * Returns null when the update should not trigger HUD effects.
 */
export function deriveVariableChangeEffects(
  update: Pick<VariableUpdatePayload, "scope" | "name" | "delta" | "op">,
  displays: ResolvedVariableDisplay[],
  now = Date.now(),
): VariableChangeEffects | null {
  if (update.scope !== "room") return null;
  if (update.op === "delete") return null;

  const display = displays.find((item) => item.name === update.name);
  if (!display || display.show_in_hud === false) return null;

  const deltaText = formatDeltaText(update.delta);
  const polarity = display.polarity ?? "higher_is_worse";
  const min = display.min ?? 0;
  const max = display.max ?? 100;
  const strong =
    typeof update.delta === "number" &&
    Number.isFinite(update.delta) &&
    isStrongVariableChange(update.delta, min, max);

  let vignette: "worse" | "better" | null = null;
  if (strong && typeof update.delta === "number") {
    const rising = update.delta > 0;
    if (polarity === "higher_is_worse") {
      vignette = rising ? "worse" : "better";
    } else {
      vignette = rising ? "better" : "worse";
    }
  }

  return {
    toast: {
      id: `${update.name}-${now}`,
      name: update.name,
      label: display.label ?? update.name,
      deltaText,
      polarity,
      expiresAt: now + TOAST_TTL_MS,
    },
    pulseTarget: update.name,
    vignette,
  };
}

export const VARIABLE_EFFECT_TTL = {
  toast: TOAST_TTL_MS,
  pulse: PULSE_TTL_MS,
  vignette: VIGNETTE_TTL_MS,
} as const;
