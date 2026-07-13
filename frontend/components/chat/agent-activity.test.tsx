"use client";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AgentActivityCard } from "./agent-activity-card";
import { AgentActivityLine } from "./agent-activity-line";
import {
  createEmptyRoomActivityRecord,
  useRoomActivityStore,
} from "@/lib/room-activity-store";

describe("AgentActivityCard", () => {
  it("shows waiting card before visible output", () => {
    const activity = {
      ...createEmptyRoomActivityRecord(),
      runActive: true,
      status: "thinking" as const,
      characterName: "小明",
    };

    render(<AgentActivityCard activity={activity} />);

    expect(screen.getByTestId("agent-activity-card")).toHaveAttribute("data-status", "thinking");
    expect(screen.getByText("小明")).toBeInTheDocument();
    expect(screen.getByText("小明正在构思…")).toBeInTheDocument();
  });

  it("hides when output is already visible", () => {
    const activity = {
      ...createEmptyRoomActivityRecord(),
      runActive: true,
      status: "streaming" as const,
      hasVisibleOutput: true,
      characterName: "小明",
    };

    const { container } = render(<AgentActivityCard activity={activity} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows error surface", () => {
    const activity = {
      ...createEmptyRoomActivityRecord(),
      status: "error" as const,
      errorMessage: "生成失败，请重试",
    };

    render(<AgentActivityCard activity={activity} />);
    expect(screen.getByTestId("agent-activity-card")).toHaveAttribute("data-status", "error");
    expect(screen.getByText("生成失败，请重试")).toBeInTheDocument();
  });
});

describe("AgentActivityLine", () => {
  it("renders tool label after visible output", () => {
    const activity = {
      ...createEmptyRoomActivityRecord(),
      runActive: true,
      status: "acting" as const,
      hasVisibleOutput: true,
      currentToolLabel: "正在写入房间…「众人行至破庙」",
      characterName: "小明",
    };

    render(<AgentActivityLine activity={activity} />);
    expect(screen.getByTestId("agent-activity-line")).toHaveTextContent("正在写入房间…「众人行至破庙」");
  });

  it("stays hidden before visible output (card owns that surface)", () => {
    const activity = {
      ...createEmptyRoomActivityRecord(),
      runActive: true,
      status: "thinking" as const,
      characterName: "小明",
    };

    const { container } = render(<AgentActivityLine activity={activity} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CharacterList activity indicator", () => {
  beforeEach(() => {
    useRoomActivityStore.setState({ records: {} });
  });

  it("marks the active speaking character", async () => {
    useRoomActivityStore.getState().startRun("default", {
      characterId: "char-1",
      characterName: "Alpha",
    });

    const { CharacterList } = await import("@/components/sidebar/character-list");
    render(
      <CharacterList
        characters={[
          {
            id: "char-1",
            name: "Alpha",
            personality: "calm",
            background: "",
            is_active: true,
          },
        ]}
        onAISpeech={() => undefined}
        onDesignateNextSpeaker={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const indicator = screen.getByTestId("character-activity-indicator");
    expect(indicator).toHaveAttribute("data-character-id", "char-1");
    expect(indicator).toHaveAttribute("data-status", "thinking");
  });
});
