import type { RoomActivityStatus } from "./room-activity-store";

export function hasSummarizableArgs(tool: string, args: Record<string, unknown>): boolean {
  if (tool === "write_to_room") {
    return typeof args.content === "string" && args.content.trim().length > 0;
  }
  if (tool === "patch_room") {
    return typeof args.content === "string" || typeof args.message_id === "string";
  }
  if (tool === "write_to_bar") {
    return typeof args.content === "string" && args.content.trim().length > 0;
  }
  if (tool === "ask_user") {
    return typeof args.question === "string" && args.question.trim().length > 0;
  }
  return Object.keys(args).length > 0;
}

/** Defer label until args are present (OpenWork parse-tool-parts pattern). */
export function shouldDeferToolLabel(tool: string, args: Record<string, unknown>): boolean {
  return !hasSummarizableArgs(tool, args);
}

export function summarizeToolArgs(
  tool: string,
  args: Record<string, unknown>,
): string | null {
  if (tool === "write_to_room" && typeof args.content === "string") {
    const t = args.content.trim();
    return t ? t.slice(0, 24) + (t.length > 24 ? "…" : "") : null;
  }
  if (tool === "patch_room" && typeof args.content === "string") {
    const t = args.content.trim();
    return t ? t.slice(0, 24) + (t.length > 24 ? "…" : "") : null;
  }
  if (tool === "write_to_bar" && typeof args.content === "string") {
    const t = args.content.trim();
    return t ? t.slice(0, 24) + (t.length > 24 ? "…" : "") : null;
  }
  if (tool === "ask_user" && typeof args.question === "string") {
    const t = args.question.trim();
    return t ? t.slice(0, 24) + (t.length > 24 ? "…" : "") : null;
  }
  if (
    (tool === "set_variable" ||
      tool === "inc_variable" ||
      tool === "dec_variable" ||
      tool === "add_variable" ||
      tool === "get_variable" ||
      tool === "delete_variable") &&
    typeof args.name === "string"
  ) {
    const name = args.name.trim();
    if (!name) return null;
    if (typeof args.delta === "number" && Number.isFinite(args.delta)) {
      return `${name} ${args.delta > 0 ? "+" : ""}${args.delta}`;
    }
    if (args.value !== undefined) {
      return `${name}=${String(args.value).slice(0, 16)}`;
    }
    return name;
  }
  return null;
}

const TOOL_BASE_LABELS: Record<string, string> = {
  write_to_room: "正在写入房间…",
  patch_room: "正在修订文稿…",
  write_to_bar: "正在更新当前形势…",
  ask_user: "等待你的抉择…",
  get_variable: "正在读取变量…",
  set_variable: "正在设置变量…",
  add_variable: "正在追加变量…",
  inc_variable: "正在提升变量…",
  dec_variable: "正在降低变量…",
  delete_variable: "正在删除变量…",
  list_variables: "正在列出变量…",
};

export function getToolActivityLabel(
  tool: string,
  args?: Record<string, unknown>,
  fallbackLabel?: string,
): string {
  const base = TOOL_BASE_LABELS[tool] ?? fallbackLabel ?? `正在执行 ${tool}…`;
  const summary = args ? summarizeToolArgs(tool, args) : null;
  if (!summary) {
    return base;
  }
  if (tool === "write_to_room") {
    return `正在写入房间…「${summary}」`;
  }
  if (tool === "patch_room") {
    return `正在修订文稿…「${summary}」`;
  }
  if (tool === "write_to_bar") {
    return `正在更新形势…「${summary}」`;
  }
  if (tool === "ask_user") {
    return `等待你的抉择…「${summary}」`;
  }
  if (
    tool === "set_variable" ||
    tool === "inc_variable" ||
    tool === "dec_variable" ||
    tool === "add_variable" ||
    tool === "get_variable" ||
    tool === "delete_variable"
  ) {
    return `${base}「${summary}」`;
  }
  return `${base}「${summary}」`;
}

export function getSessionActivityStatusLabel(
  status: RoomActivityStatus,
  characterName?: string | null,
): string {
  const who = characterName ? `${characterName}` : "Agent";
  switch (status) {
    case "thinking":
      return `${who}正在构思…`;
    case "acting":
      return `${who}正在行动…`;
    case "streaming":
      return `${who}正在落笔…`;
    case "awaiting_user":
      return "等待你的抉择…";
    case "error":
      return "本轮生成失败";
    default:
      return "";
  }
}
