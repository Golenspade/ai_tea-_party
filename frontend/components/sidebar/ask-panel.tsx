"use client";

import { useEffect, useMemo, useState } from "react";
import type { PendingAskPublic, AskAnswer } from "@/lib/types";

interface AskPanelProps {
  pendingAsk: PendingAskPublic | null;
  onSubmit: (askId: string, answer: AskAnswer) => Promise<void>;
  isSubmitting?: boolean;
}

export function AskPanel({ pendingAsk, onSubmit, isSubmitting }: AskPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    setSelected([]);
    setCustom("");
  }, [pendingAsk?.id]);

  const canSubmit = useMemo(() => {
    if (!pendingAsk) return false;
    if (pendingAsk.multiple) {
      return selected.length > 0 || (pendingAsk.allow_custom && custom.trim());
    }
    return selected.length === 1 || (pendingAsk.allow_custom && custom.trim());
  }, [pendingAsk, selected, custom]);

  if (!pendingAsk || pendingAsk.status !== "pending") {
    return (
      <div className="pt-3 border-t border-[var(--theme-border)] px-2">
        <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
          Ask
        </h2>
        <p className="text-xs text-[#7e766c] mt-2">暂无待回答的问题</p>
      </div>
    );
  }

  const toggleChoice = (choice: string) => {
    if (pendingAsk.multiple) {
      setSelected((prev) =>
        prev.includes(choice) ? prev.filter((item) => item !== choice) : [...prev, choice],
      );
      return;
    }
    setSelected([choice]);
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    const answer: AskAnswer = {
      selected: selected.length ? selected : undefined,
      custom: custom.trim() || undefined,
    };

    await onSubmit(pendingAsk.id, answer);
    setSelected([]);
    setCustom("");
  };

  return (
    <div className="pt-3 border-t border-[var(--theme-border)] px-2">
      <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
        Ask
      </h2>
      <p className="text-sm text-[var(--text)] mt-3 leading-relaxed">{pendingAsk.question}</p>

      <div className="mt-3 space-y-2">
        {pendingAsk.choices.map((choice) => {
          const active = selected.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              disabled={isSubmitting}
              onClick={() => toggleChoice(choice)}
              className={`w-full text-left px-3 py-2 text-xs rounded-sm border transition-colors ${
                active
                  ? "border-[#a35d40] bg-[#fbf8f1] text-[#3b3631]"
                  : "border-[var(--theme-border)] bg-white hover:bg-[#f1ede3]"
              }`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {pendingAsk.allow_custom && (
        <textarea
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="或输入自定义回答…"
          rows={2}
          className="mt-3 w-full text-xs px-2 py-1.5 rounded-sm border border-[var(--theme-border)] bg-white resize-none"
        />
      )}

      <button
        type="button"
        disabled={!canSubmit || isSubmitting}
        onClick={() => void handleSubmit()}
        className="mt-3 w-full px-3 py-1.5 text-xs rounded-sm border border-[var(--theme-border)] bg-white hover:bg-[#f1ede3] disabled:opacity-50"
      >
        {isSubmitting ? "提交中…" : "确认选择"}
      </button>
    </div>
  );
}
