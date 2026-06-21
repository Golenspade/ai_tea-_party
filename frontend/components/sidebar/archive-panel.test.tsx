import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  RoomArchiveRecord,
  RoomCompactResult,
  RoomSummary,
} from "@/lib/types";
import { ArchivePanel } from "./archive-panel";

const summary: RoomSummary = {
  id: "summary-1",
  room_id: "default",
  start_message_id: "m1",
  end_message_id: "m3",
  message_count: 3,
  summary: "旧消息已经压缩为摘要。",
  source: "deterministic",
  created_at: "2026-06-09T00:00:00.000Z",
};

const archive: RoomArchiveRecord = {
  id: "archive-1",
  room_id: "default",
  title: "手动归档",
  created_at: "2026-06-09T00:01:00.000Z",
  manifest: {
    schema_version: 1,
    archive_id: "archive-1",
    room_id: "default",
    title: "手动归档",
    created_at: "2026-06-09T00:01:00.000Z",
    message_count: 12,
    summary_count: 1,
    variable_count: 2,
    world_info_book_ids: [],
  },
};

describe("ArchivePanel", () => {
  it("shows empty states and calls actions", () => {
    const onRefresh = vi.fn();
    const onCompact = vi.fn().mockResolvedValue(undefined);
    const onArchive = vi.fn().mockResolvedValue(undefined);

    render(
      <ArchivePanel
        summaries={[]}
        archives={[]}
        onRefresh={onRefresh}
        onCompact={onCompact}
        onArchive={onArchive}
      />,
    );

    expect(screen.getByText("暂无历史摘要")).toBeInTheDocument();
    expect(screen.getByText("暂无归档")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("刷新归档"));
    fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Archive$/ }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onCompact).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("renders summaries, archives, and compact status", () => {
    const result: RoomCompactResult = {
      room_id: "default",
      status: "committed",
      keep_recent: 25,
      range: {
        start_message_id: "m1",
        end_message_id: "m3",
        message_count: 3,
      },
      summary,
    };

    render(
      <ArchivePanel
        summaries={[summary]}
        archives={[archive]}
        lastCompactResult={result}
        onRefresh={vi.fn()}
        onCompact={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    expect(screen.getByText("已压缩 3 条")).toBeInTheDocument();
    expect(screen.getByText("旧消息已经压缩为摘要。")).toBeInTheDocument();
    expect(screen.getByText("手动归档")).toBeInTheDocument();
    expect(screen.getByText(/12 messages/)).toBeInTheDocument();
  });
});
