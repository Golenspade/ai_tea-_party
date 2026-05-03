"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  VariableEntry,
  VariablePatchRequest,
  VariableSetRequest,
  VariableScope,
} from "@/lib/types";

interface VariablesPanelProps {
  roomVariables: VariableEntry[];
  globalVariables: VariableEntry[];
  loading?: boolean;
  onRefresh: () => void;
  onSet: (scope: VariableScope, data: VariableSetRequest) => Promise<void>;
  onAdd: (scope: VariableScope, data: VariablePatchRequest) => Promise<void>;
  onInc: (scope: VariableScope, data: VariablePatchRequest) => Promise<void>;
  onDec: (scope: VariableScope, data: VariablePatchRequest) => Promise<void>;
  onDelete: (scope: VariableScope, name: string) => Promise<void>;
}

interface OpFormState {
  scope: VariableScope;
  op: "set" | "add" | "inc" | "dec";
  name: string;
  value: string;
  isBusy: boolean;
}

function parseVariableValue(raw: string): unknown {
  const text = raw.trim();
  if (!text) return "";

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function scopeTitle(scope: VariableScope): string {
  return scope === "global" ? "Global" : "Room";
}

export function VariablesPanel({
  roomVariables,
  globalVariables,
  loading,
  onRefresh,
  onSet,
  onAdd,
  onInc,
  onDec,
  onDelete,
}: VariablesPanelProps) {
  const [formState, setFormState] = useState<OpFormState>({
    scope: "room",
    op: "set",
    name: "",
    value: "",
    isBusy: false,
  });

  const valuesByScope = useMemo(() => {
    const grouped: Record<VariableScope, VariableEntry[]> = {
      room: [...roomVariables],
      global: [...globalVariables],
    };

    grouped.room.sort((a, b) => a.name.localeCompare(b.name));
    grouped.global.sort((a, b) => a.name.localeCompare(b.name));
    return grouped;
  }, [roomVariables, globalVariables]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) return;
    setFormState((prev) => ({ ...prev, isBusy: true }));

    try {
      const payload = { name: formState.name.trim(), value: parseVariableValue(formState.value) };
      if (formState.op === "set") {
        await onSet(formState.scope, payload);
      } else if (formState.op === "add") {
        await onAdd(formState.scope, payload);
      } else if (formState.op === "inc") {
        await onInc(formState.scope, payload);
      } else {
        await onDec(formState.scope, payload);
      }

      setFormState((prev) => ({ ...prev, name: "", value: "" }));
    } finally {
      setFormState((prev) => ({ ...prev, isBusy: false }));
    }
  };

  const renderList = (scope: VariableScope) => {
    if (valuesByScope[scope].length === 0) {
      return <p className="text-xs text-[#7e766c] py-2">未设置变量</p>;
    }

    return (
      <ul className="space-y-2">
        {valuesByScope[scope].map((item) => (
          <li
            key={`${scope}-${item.name}`}
            className="rounded-sm border border-[var(--theme-border)] px-3 py-2 text-xs bg-white"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-[var(--text)] truncate">{item.name}</p>
                <p className="mt-1 text-[var(--theme-accent)] break-words">
                  {formatValue(item.value)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(scope, item.name)}
                className="text-red-700/75 hover:text-red-700 text-[11px] whitespace-nowrap"
                title="删除变量"
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="pt-3 border-t border-[var(--theme-border)]">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
          Variables
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="text-[11px] px-2 py-1 rounded-sm border border-[var(--theme-border)] hover:bg-[#f1ede3]"
        >
          {loading ? "..." : "刷新"}
        </button>
      </div>

      <form className="mt-3 px-2 space-y-2" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            Scope
            <select
              value={formState.scope}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, scope: e.target.value as VariableScope }))
              }
              className="px-2 py-1 rounded-sm border border-[var(--theme-border)] bg-white"
            >
              <option value="room">Room</option>
              <option value="global">Global</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Op
            <select
              value={formState.op}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  op: e.target.value as OpFormState["op"],
                }))
              }
              className="px-2 py-1 rounded-sm border border-[var(--theme-border)] bg-white"
            >
              <option value="set">set</option>
              <option value="add">add</option>
              <option value="inc">inc</option>
              <option value="dec">dec</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          Name
          <input
            value={formState.name}
            onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="变量名"
            className="px-2 py-1 rounded-sm border border-[var(--theme-border)] bg-white"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          Value
          <input
            value={formState.value}
            onChange={(e) => setFormState((prev) => ({ ...prev, value: e.target.value }))}
            placeholder="JSON/字符串/数字（留空=默认）"
            className="px-2 py-1 rounded-sm border border-[var(--theme-border)] bg-white"
          />
        </label>

        <button
          type="submit"
          disabled={formState.isBusy}
          className="w-full px-3 py-1.5 text-xs rounded-sm border border-[var(--theme-border)] bg-white hover:bg-[#f1ede3] disabled:opacity-50"
        >
          执行
        </button>
      </form>

      <div className="mt-4 px-2 space-y-4">
        {(["room", "global"] as const).map((scope) => (
          <div key={scope}>
            <h3 className="text-xs text-[var(--theme-accent)] mb-1">{scopeTitle(scope)}</h3>
            {renderList(scope)}
          </div>
        ))}
      </div>
    </div>
  );
}
