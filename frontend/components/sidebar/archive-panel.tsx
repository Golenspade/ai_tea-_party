"use client";

import { Archive, RefreshCw, Rows3 } from "lucide-react";

import type {
  RoomArchiveRecord,
  RoomCompactResult,
  RoomSummary,
} from "@/lib/types";

interface ArchivePanelProps {
  summaries: RoomSummary[];
  archives: RoomArchiveRecord[];
  loading?: boolean;
  compacting?: boolean;
  archiving?: boolean;
  lastCompactResult?: RoomCompactResult | null;
  onRefresh: () => void;
  onCompact: () => Promise<void>;
  onArchive: () => Promise<void>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function compactStatusText(result: RoomCompactResult | null | undefined): string {
  if (!result) {
    return "";
  }
  if (result.status === "no_op") {
    return result.reason || "没有可压缩内容";
  }
  if (result.status === "dry_run") {
    return `预览 ${result.range?.message_count ?? 0} 条`;
  }
  return `已压缩 ${result.summary?.message_count ?? result.range?.message_count ?? 0} 条`;
}

export function ArchivePanel({
  summaries,
  archives,
  loading,
  compacting,
  archiving,
  lastCompactResult,
  onRefresh,
  onCompact,
  onArchive,
}: ArchivePanelProps) {
  const recentSummaries = [...summaries].slice(-3).reverse();
  const recentArchives = [...archives].slice(-3).reverse();
  const status = compactStatusText(lastCompactResult);

  return (
    <section className="pt-3 border-t border-[var(--theme-border)]">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold">
          Archive
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="h-7 w-7 inline-flex items-center justify-center rounded-sm border border-[var(--theme-border)] hover:bg-[#f1ede3]"
          title="刷新归档"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 px-2">
        <button
          type="button"
          onClick={() => {
            void onCompact();
          }}
          disabled={compacting || loading}
          className="inline-flex items-center justify-center gap-1 rounded-sm border border-[var(--theme-border)] px-2 py-1.5 text-xs hover:bg-[#f1ede3] disabled:opacity-60"
        >
          <Rows3 className="h-3.5 w-3.5" />
          {compacting ? "Compacting" : "Compact"}
        </button>
        <button
          type="button"
          onClick={() => {
            void onArchive();
          }}
          disabled={archiving || loading}
          className="inline-flex items-center justify-center gap-1 rounded-sm border border-[var(--theme-border)] px-2 py-1.5 text-xs hover:bg-[#f1ede3] disabled:opacity-60"
        >
          <Archive className="h-3.5 w-3.5" />
          {archiving ? "Archiving" : "Archive"}
        </button>
      </div>

      {status && (
        <p className="mt-2 px-2 text-[11px] text-[var(--theme-accent)]">{status}</p>
      )}

      <div className="mt-4 px-2">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[#7e766c]">
          Summaries
        </p>
        {recentSummaries.length === 0 ? (
          <p className="mt-2 text-xs text-[#7e766c]">暂无历史摘要</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recentSummaries.map((summary) => (
              <li
                key={summary.id}
                className="rounded-sm border border-[var(--theme-border)] bg-white px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text)]">
                    {summary.message_count} 条
                  </span>
                  <span className="text-[11px] text-[#7e766c]">
                    {summary.source}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[#5f574c]">{summary.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 px-2">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[#7e766c]">
          Archives
        </p>
        {recentArchives.length === 0 ? (
          <p className="mt-2 text-xs text-[#7e766c]">暂无归档</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recentArchives.map((archive) => (
              <li
                key={archive.id}
                className="rounded-sm border border-[var(--theme-border)] bg-white px-3 py-2 text-xs"
              >
                <p className="font-medium text-[var(--text)] truncate">{archive.title}</p>
                <p className="mt-1 text-[11px] text-[#7e766c]">
                  {archive.manifest.message_count} messages · {formatDate(archive.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
