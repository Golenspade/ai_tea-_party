import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PendingAskPublic } from "@/lib/types";
import { AskPanel } from "./ask-panel";

const baseAsk: PendingAskPublic = {
  id: "ask-1",
  room_id: "default",
  request_id: "req-1",
  character_id: "char-1",
  question: "往哪走？",
  choices: ["左边", "右边", "等待"],
  allow_custom: false,
  multiple: false,
  status: "pending",
  created_at: "2026-06-03T00:00:00.000Z",
};

describe("AskPanel", () => {
  it("submits a single selected choice", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AskPanel pendingAsk={baseAsk} onSubmit={onSubmit} />);

    const submit = screen.getByRole("button", { name: "确认选择" });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "右边" }));
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith("ask-1", { selected: ["右边"], custom: undefined });
  });

  it("submits multiple selected choices", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AskPanel pendingAsk={{ ...baseAsk, multiple: true }} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "左边" }));
    fireEvent.click(screen.getByRole("button", { name: "等待" }));
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));

    expect(onSubmit).toHaveBeenCalledWith("ask-1", {
      selected: ["左边", "等待"],
      custom: undefined,
    });
  });

  it("submits a custom answer when allowed", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AskPanel pendingAsk={{ ...baseAsk, allow_custom: true }} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("或输入自定义回答…"), {
      target: { value: "先观察门口" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认选择" }));

    expect(onSubmit).toHaveBeenCalledWith("ask-1", {
      selected: undefined,
      custom: "先观察门口",
    });
  });

  it("disables controls while submitting", () => {
    render(<AskPanel pendingAsk={baseAsk} onSubmit={vi.fn()} isSubmitting />);

    expect(screen.getByRole("button", { name: "左边" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交中…" })).toBeDisabled();
  });
});
