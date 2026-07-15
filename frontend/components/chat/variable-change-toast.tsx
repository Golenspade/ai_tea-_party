"use client";

import type { VariableChangeToastItem } from "@/lib/variable-change-effects";

interface VariableChangeToastProps {
  toasts: VariableChangeToastItem[];
}

/**
 * Spec §5.3 — floating delta labels. Must use --z-toast and pointer-events-none
 * so room content stays interactive and visually primary.
 */
export function VariableChangeToast({ toasts }: VariableChangeToastProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-3 z-[var(--z-toast)] flex flex-col items-end gap-1 px-3"
      data-testid="variable-change-toasts"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="variable-change-toast rounded-sm border border-[var(--theme-border)] bg-[#fffcf8]/95 px-2.5 py-1 text-xs shadow-sm"
          data-testid={`variable-change-toast-${toast.name}`}
        >
          <span className="font-medium text-[var(--text)]">{toast.label}</span>
          {toast.deltaText ? (
            <span
              className={
                toast.polarity === "higher_is_worse"
                  ? "ml-1.5 tabular-nums text-[var(--destructive)]"
                  : "ml-1.5 tabular-nums text-[var(--theme-accent)]"
              }
            >
              {toast.deltaText}
            </span>
          ) : (
            <span className="ml-1.5 text-[var(--theme-accent)]">更新</span>
          )}
        </div>
      ))}
    </div>
  );
}
