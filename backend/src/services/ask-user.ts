import type { AskAnswer, PendingAsk } from "@ai-party/shared";

export interface CreatePendingAskInput {
  roomId: string;
  requestId: string;
  characterId: string;
  toolCallId: string;
  question: string;
  choices: string[];
  allowCustom: boolean;
  multiple: boolean;
  agentMessagesJson: string;
  systemPrompt: string;
  provider: string;
  model: string;
}

export function parseAskUserInput(args: Record<string, unknown>): {
  question: string;
  choices: string[];
  allowCustom: boolean;
  multiple: boolean;
} {
  if (typeof args.question !== "string" || !args.question.trim()) {
    throw new Error("question 不能为空");
  }

  const rawChoices = args.choices;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
    throw new Error("choices 至少包含一项");
  }

  const choices = rawChoices
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (choices.length === 0) {
    throw new Error("choices 至少包含一项有效字符串");
  }

  return {
    question: args.question.trim(),
    choices,
    allowCustom: Boolean(args.allow_custom),
    multiple: Boolean(args.multiple),
  };
}

export function formatAskAnswer(answer: AskAnswer): string {
  const parts: string[] = [];

  if (answer.selected?.length) {
    parts.push(`选择：${answer.selected.join("；")}`);
  }

  if (answer.custom?.trim()) {
    parts.push(`补充：${answer.custom.trim()}`);
  }

  return parts.join("\n") || "（用户未提供有效回答）";
}

export function validateAskAnswer(pending: PendingAsk, answer: AskAnswer): void {
  const selected = answer.selected ?? [];
  const custom = answer.custom?.trim() ?? "";

  if (!pending.allow_custom && custom) {
    throw new Error("此问题不允许自定义回答");
  }

  for (const choice of selected) {
    if (!pending.choices.includes(choice)) {
      throw new Error(`无效选项: ${choice}`);
    }
  }

  if (pending.multiple) {
    if (selected.length === 0 && !custom) {
      throw new Error("请至少选择一项或填写自定义回答");
    }
    return;
  }

  if (selected.length > 1) {
    throw new Error("此问题仅允许单选");
  }

  if (selected.length === 0 && !custom) {
    throw new Error("请选择一项或填写自定义回答");
  }
}

export function pendingAskToPublic(ask: PendingAsk) {
  return {
    id: ask.id,
    room_id: ask.room_id,
    request_id: ask.request_id,
    character_id: ask.character_id,
    question: ask.question,
    choices: ask.choices,
    allow_custom: ask.allow_custom,
    multiple: ask.multiple,
    status: ask.status,
    created_at: ask.created_at,
  };
}
