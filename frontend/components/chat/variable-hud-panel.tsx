"use client";

import {
  getVariableSeverityColor,
  isValueOutsideRange,
  normalizeRatio,
  type ResolvedVariableDisplay,
} from "@/lib/variable-viz";

interface VariableHudPanelProps {
  displays: ResolvedVariableDisplay[];
  values: Record<string, unknown>;
  pulseTarget?: string | null;
  /** When true, render as a fixed bottom strip for narrow screens. */
  compact?: boolean;
}

/**
 * Spec §4 / §5.1 — read-only Galgame-style room variable HUD (right rail).
 * Instant effects (toast / vignette) arrive in Phase 4.3 and must use --z-toast.
 * Spec §4.3 / Phase 4.4 — `compact` enables the bottom horizontal strip.
 */
export function VariableHudPanel({
  displays,
  values,
  pulseTarget = null,
  compact = false,
}: VariableHudPanelProps) {
  if (displays.length === 0) {
    return null;
  }

  const shellClass = compact
    ? "variable-hud-panel variable-hud-compact absolute bottom-0 left-0 right-0 z-[var(--z-hud)] flex h-auto flex-row gap-2 overflow-x-auto border-t border-[var(--theme-border)] bg-[#fdfaf5]/95 px-3 py-2 backdrop-blur-sm"
    : "variable-hud-panel relative w-52 sm:w-56 shrink-0 border-l border-[var(--theme-border)] bg-[#fdfaf5] px-3 py-4 overflow-y-auto z-[var(--z-hud)]";

  const listClass = compact ? "flex flex-row gap-2" : "space-y-2";

  return (
    <aside
      className={shellClass}
      data-testid="variable-hud-panel"
      data-compact={compact ? "true" : "false"}
      aria-label="房间状态"
    >
      {!compact ? (
        <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold mb-3 px-1">
          状态
        </h2>
      ) : null}
      <ul className={listClass}>
        {displays.map((display) => {
          const raw = values[display.name];
          const numeric =
            typeof raw === "number" && Number.isFinite(raw) ? raw : null;
          const min = display.min ?? 0;
          const max = display.max ?? 100;
          const ratio =
            numeric === null ? 0 : normalizeRatio(numeric, min, max);
          const color = getVariableSeverityColor(
            ratio,
            display.polarity ?? "higher_is_worse",
          );
          const overflow =
            numeric !== null && isValueOutsideRange(numeric, min, max);
          const pulsing = pulseTarget === display.name;

          return (
            <li
              key={display.name}
              className={
                compact
                  ? `min-w-[7.5rem] shrink-0 rounded-sm border border-[var(--theme-border)] px-3 py-2 text-xs bg-white ${pulsing ? "variable-hud-pulse" : ""}`
                  : `rounded-sm border border-[var(--theme-border)] px-3 py-2 text-xs bg-white ${pulsing ? "variable-hud-pulse" : ""}`
              }
              data-testid={`variable-hud-${display.name}`}
              data-pulsing={pulsing ? "true" : "false"}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-[var(--text)] truncate tracking-wide">
                  {display.label ?? display.name}
                </p>
                <p className="text-[var(--theme-accent)] tabular-nums shrink-0">
                  {raw === undefined || raw === null ? "" : String(raw)}
                  {overflow ? (
                    <span className="ml-0.5 text-[var(--destructive)]" title="超出量程">
                      !
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#ece6d8] overflow-hidden">
                <div
                  className="h-full origin-bottom transition-all duration-300 ease-out"
                  style={{ width: `${ratio * 100}%`, backgroundColor: color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
