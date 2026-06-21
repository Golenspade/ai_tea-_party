import { describe, expect, it } from "vitest";

import { parseMarkdownBlocks } from "./markdown-blocks";

describe("parseMarkdownBlocks", () => {
  it("keeps plain markdown as a text block", () => {
    expect(parseMarkdownBlocks("hello\nworld")).toEqual([
      { type: "text", content: "hello\nworld" },
    ]);
  });

  it("marks a closed mermaid fence as complete", () => {
    expect(parseMarkdownBlocks("before\n```mermaid\ngraph TD\nA-->B\n```\nafter")).toEqual([
      { type: "text", content: "before" },
      { type: "code", language: "mermaid", content: "graph TD\nA-->B", complete: true },
      { type: "text", content: "after" },
    ]);
  });

  it("marks an unclosed fence as incomplete", () => {
    expect(parseMarkdownBlocks("```mermaid\ngraph TD\nA-->B")).toEqual([
      { type: "code", language: "mermaid", content: "graph TD\nA-->B", complete: false },
    ]);
  });
});
