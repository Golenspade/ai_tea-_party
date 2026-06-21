import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchWorldInfoBooks: vi.fn(),
  createWorldInfoBook: vi.fn(),
  deleteWorldInfoBook: vi.fn(),
  createWorldInfoEntry: vi.fn(),
  deleteWorldInfoEntry: vi.fn(),
}));

vi.mock("@/services/api", () => apiMocks);

import { WorldInfoDialog } from "./world-info-dialog";

describe("WorldInfoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchWorldInfoBooks.mockResolvedValue([
      {
        id: "book-1",
        name: "条件书",
        description: "",
        enabled: true,
        entries: [],
      },
    ]);
    apiMocks.createWorldInfoEntry.mockResolvedValue({
      id: "entry-1",
      keys: ["密室"],
      secondary_keys: [],
      selective_logic: "AND",
      content: "密室门打开。",
      position: "after_char",
      depth: 4,
      enabled: true,
      constant: false,
      order: 100,
      conditions: [{ scope: "room", name: "danger", op: "gte", value: 5 }],
      condition_logic: "AND",
    });
  });

  it("submits variable conditions when creating a world info entry", async () => {
    render(<WorldInfoDialog />);

    fireEvent.click(screen.getByRole("button", { name: "世界观管理" }));
    expect(await screen.findByText("条件书")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("展开 条件书"));
    fireEvent.change(screen.getByPlaceholderText("触发关键词（逗号分隔）"), {
      target: { value: "密室" },
    });
    fireEvent.change(screen.getByPlaceholderText("注入内容"), {
      target: { value: "密室门打开。" },
    });
    fireEvent.change(screen.getByPlaceholderText(/scope/), {
      target: {
        value: '[{"scope":"room","name":"danger","op":"gte","value":5}]',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /添加条目/ }));

    await waitFor(() => {
      expect(apiMocks.createWorldInfoEntry).toHaveBeenCalledWith("book-1", {
        keys: ["密室"],
        content: "密室门打开。",
        position: "after_char",
        conditions: [{ scope: "room", name: "danger", op: "gte", value: 5 }],
        condition_logic: "AND",
      });
    });
  });
});
