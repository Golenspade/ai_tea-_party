import { describe, expect, it } from "vitest";

import { computeParagraphDiff, diffParagraphs, splitParagraphs } from "./paragraph-diff";

describe("splitParagraphs", () => {
  it("splits on blank lines and trims", () => {
    expect(splitParagraphs("第一段\n\n第二段\n\n\n第三段")).toEqual(["第一段", "第二段", "第三段"]);
  });

  it("returns empty for blank content", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("diffParagraphs / computeParagraphDiff", () => {
  it("marks unchanged paragraphs as equal", () => {
    expect(diffParagraphs(["A", "B"], ["A", "B"])).toEqual([
      { type: "equal", text: "A" },
      { type: "equal", text: "B" },
    ]);
  });

  it("detects insert and delete", () => {
    expect(diffParagraphs(["A", "C"], ["A", "B", "C"])).toEqual([
      { type: "equal", text: "A" },
      { type: "insert", text: "B" },
      { type: "equal", text: "C" },
    ]);
    expect(diffParagraphs(["A", "B", "C"], ["A", "C"])).toEqual([
      { type: "equal", text: "A" },
      { type: "delete", text: "B" },
      { type: "equal", text: "C" },
    ]);
  });

  it("collapses adjacent delete+insert into replace", () => {
    expect(computeParagraphDiff("旧段一\n\n旧段二", "旧段一\n\n新段二")).toEqual([
      { type: "equal", text: "旧段一" },
      { type: "replace", before: "旧段二", after: "新段二" },
    ]);
  });

  it("treats full rewrite as replace when both are single paragraphs", () => {
    expect(computeParagraphDiff("旧正文", "新正文")).toEqual([
      { type: "replace", before: "旧正文", after: "新正文" },
    ]);
  });
});
