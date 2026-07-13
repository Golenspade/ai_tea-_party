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
}

/**
 * Spec §4 / §5.1 — read-only Galgame-style room variable HUD (right rail).
 * Instant effects (toast / vignette) arrive in Phase 4.3 and must use --z-toast.
 */
export function VariableHudPanel({ displays, values }: VariableHudPanelProps) {
  if (displays.length === 0) {
    return null;
  }

  return (
    <aside
      className="variable-hud-panel relative w-52 sm:w-56 shrink-0 border-l border-[var(--theme-border)] bg-[#fdfaf5] px-3 py-4 overflow-y-auto z-[var(--z-hud)]"
      data-testid="variable-hud-panel"
      aria-label="房间状态"
    >
      <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold mb-3 px-1">
        状态
      </h2>
      <ul className="space-y-2">
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

          return (
            <li
              key={display.name}
              className="rounded-sm border border-[var(--theme-border)] px-3 py-2 text-xs bg-white"
              data-testid={`variable-hud-${display.name}`}
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
                  className="h-full transition-all duration-300 ease-out"
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
