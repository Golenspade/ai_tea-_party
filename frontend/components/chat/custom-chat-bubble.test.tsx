import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/types";
import { CustomChatBubble, MarkdownBody } from "./custom-chat-bubble";

vi.mock("@/components/chat/mermaid-diagram", () => ({
  MermaidDiagram: ({ source }: { source: string }) => (
    <div data-testid="mermaid-diagram">{source}</div>
  ),
}));

describe("MarkdownBody", () => {
  it("renders normal markdown text", () => {
    render(<MarkdownBody content="**加粗** 文本" />);

    expect(screen.getByText("加粗")).toBeInTheDocument();
    expect(screen.getByText(/文本/)).toBeInTheDocument();
  });

  it("renders non-mermaid code as a code block", () => {
    render(<MarkdownBody content={"```json\n{\"ok\":true}\n```"} />);

    expect(screen.getByText('{"ok":true}')).toBeInTheDocument();
  });

  it("renders a completed mermaid block with MermaidDiagram", () => {
    render(<MarkdownBody content={"```mermaid\ngraph TD\nA-->B\n```"} />);

    expect(screen.getByTestId("mermaid-diagram")).toHaveTextContent(/graph TD\s+A-->B/);
  });

  it("buffers an incomplete mermaid block", () => {
    render(<MarkdownBody content={"```mermaid\ngraph TD\nA-->B"} />);

    expect(screen.getByText("图表渲染中…")).toBeInTheDocument();
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });
});

describe("CustomChatBubble", () => {
  const message: Message = {
    id: "message-1",
    character_id: "char-1",
    character_name: "Navigator",
    content: "修订后的正文",
    timestamp: "2026-06-09T00:00:00.000Z",
    is_system: false,
    sender_type: "ai",
  };

  it("marks patched AI messages for highlight styling", () => {
    render(<CustomChatBubble message={message} characters={[]} isPatched />);

    expect(screen.getByText("修订后的正文").closest("[data-patched='true']")).toBeInTheDocument();
  });

  it("marks patched narrator messages for highlight styling", () => {
    render(
      <CustomChatBubble
        message={{ ...message, is_system: true, sender_type: "system", character_name: "旁白" }}
        characters={[]}
        isPatched
      />,
    );

    expect(screen.getByText("修订后的正文").closest("[data-patched='true']")).toBeInTheDocument();
  });

  it("renders paragraph-level insert/delete segments while flashing", () => {
    render(
      <CustomChatBubble
        message={{ ...message, content: "保留段\n\n新段" }}
        characters={[]}
        isPatched
        paragraphDiff={[
          { type: "equal", text: "保留段" },
          { type: "delete", text: "旧段" },
          { type: "insert", text: "新段" },
        ]}
      />,
    );

    expect(document.querySelector("[data-paragraph-diff='true']")).toBeInTheDocument();
    expect(document.querySelector("[data-patch-variant='delete']")).toHaveTextContent("旧段");
    expect(document.querySelector("[data-patch-variant='insert']")).toHaveTextContent("新段");
    expect(screen.getByText("保留段")).toBeInTheDocument();
  });
});
