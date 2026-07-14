import { describe, expect, it } from "vitest";

import {
  getToolActivityLabel,
  shouldDeferToolLabel,
  summarizeToolArgs,
} from "./tool-activity";

describe("tool-activity", () => {
  it("defers empty write_to_room args", () => {
    expect(shouldDeferToolLabel("write_to_room", {})).toBe(true);
    expect(shouldDeferToolLabel("write_to_room", { content: "" })).toBe(true);
  });

  it("summarizes write_to_room content", () => {
    const args = { content: "众人行至破庙门前，风声渐紧" };
    expect(summarizeToolArgs("write_to_room", args)).toBe("众人行至破庙门前，风声渐紧");
    expect(getToolActivityLabel("write_to_room", args)).toBe(
      "正在写入房间…「众人行至破庙门前，风声渐紧」",
    );
  });

  it("summarizes variable tool names", () => {
    expect(summarizeToolArgs("inc_variable", { name: "danger", delta: 3 })).toBe(
      "danger +3",
    );
    expect(getToolActivityLabel("inc_variable", { name: "danger", delta: 3 })).toBe(
      "正在提升变量…「danger +3」",
    );
    expect(getToolActivityLabel("delete_variable", { name: "tmp" })).toBe(
      "正在删除变量…「tmp」",
    );
  });

  it("uses base label when args are deferred", () => {
    expect(getToolActivityLabel("write_to_bar", {})).toBe("正在更新当前形势…");
  });
});
