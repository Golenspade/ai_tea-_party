import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PendingAsk } from "@ai-party/shared";

import { parseAskUserInput, validateAskAnswer } from "./ask-user";

const basePending: PendingAsk = {
  id: "ask-1",
  room_id: "room-1",
  request_id: "req-1",
  character_id: "char-1",
  tool_call_id: "tool-1",
  question: "选哪条路？",
  choices: ["A", "B", "C"],
  allow_custom: false,
  multiple: false,
  status: "pending",
  created_at: "2026-06-03T00:00:00.000Z",
};

describe("ask-user", () => {
  it("parses ask_user args", () => {
    const parsed = parseAskUserInput({
      question: "  继续吗？  ",
      choices: ["是", "否"],
      allow_custom: true,
      multiple: true,
    });

    assert.equal(parsed.question, "继续吗？");
    assert.deepEqual(parsed.choices, ["是", "否"]);
    assert.equal(parsed.allowCustom, true);
    assert.equal(parsed.multiple, true);
  });

  it("rejects empty questions and choices", () => {
    assert.throws(() => parseAskUserInput({ question: " ", choices: ["A"] }), /question/);
    assert.throws(() => parseAskUserInput({ question: "继续吗？", choices: [] }), /choices/);
    assert.throws(() => parseAskUserInput({ question: "继续吗？", choices: ["  ", 1] }), /有效字符串/);
  });

  it("rejects invalid choice on answer", () => {
    assert.throws(
      () => validateAskAnswer(basePending, { selected: ["Z"] }),
      /无效选项/,
    );
  });

  it("requires one selection for single-choice ask", () => {
    assert.throws(() => validateAskAnswer(basePending, {}), /请选择/);
    assert.doesNotThrow(() => validateAskAnswer(basePending, { selected: ["A"] }));
  });

  it("rejects multiple selections for single-choice ask", () => {
    assert.throws(
      () => validateAskAnswer(basePending, { selected: ["A", "B"] }),
      /仅允许单选/,
    );
  });

  it("rejects custom answers unless allowed", () => {
    assert.throws(
      () => validateAskAnswer(basePending, { custom: "走小路" }),
      /不允许自定义回答/,
    );
    assert.doesNotThrow(() =>
      validateAskAnswer({ ...basePending, allow_custom: true }, { custom: "走小路" }),
    );
  });

  it("allows multiple selections when enabled", () => {
    const pending = { ...basePending, multiple: true };
    assert.doesNotThrow(() =>
      validateAskAnswer(pending, { selected: ["A", "C"] }),
    );
  });
});
