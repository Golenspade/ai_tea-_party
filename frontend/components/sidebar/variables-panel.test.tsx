import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ActiveBranch } from "@/lib/types";
import { VariablesPanel } from "./variables-panel";

const noop = vi.fn().mockResolvedValue(undefined);

describe("VariablesPanel", () => {
  it("renders active branch empty state", () => {
    render(
      <VariablesPanel
        roomVariables={[]}
        globalVariables={[]}
        activeBranches={[]}
        onRefresh={vi.fn()}
        onSet={noop}
        onAdd={noop}
        onInc={noop}
        onDec={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText("Active Branches")).toBeInTheDocument();
    expect(screen.getByText("暂无命中分支")).toBeInTheDocument();
  });

  it("renders active world info and behavior rule branches", () => {
    const branches: ActiveBranch[] = [
      {
        id: "entry-1",
        type: "world_info",
        name: "危险",
        source: "变量世界书",
        content: "危险分支世界书内容。",
        priority: 30,
      },
      {
        id: "rule-1",
        type: "behavior_rule",
        name: "高风险行为",
        source: "行为书",
        content: "角色应优先自保。",
        priority: 10,
      },
    ];

    render(
      <VariablesPanel
        roomVariables={[]}
        globalVariables={[]}
        activeBranches={branches}
        onRefresh={vi.fn()}
        onSet={noop}
        onAdd={noop}
        onInc={noop}
        onDec={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText("危险")).toBeInTheDocument();
    expect(screen.getByText("变量世界书")).toBeInTheDocument();
    expect(screen.getByText("危险分支世界书内容。")).toBeInTheDocument();
    expect(screen.getByText("高风险行为")).toBeInTheDocument();
    expect(screen.getByText("角色应优先自保。")).toBeInTheDocument();
  });
});
