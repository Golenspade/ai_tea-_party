import type {
  Message,
  RoomCompactRange,
  RoomSummary,
} from "@ai-party/shared";

const DEFAULT_KEEP_RECENT_MESSAGES = 25;
const MAX_SUMMARY_LINE_CHARS = 180;
const MAX_SUMMARY_LINES = 24;

export interface SelectCompactionRangeOptions {
  keepRecent?: number;
  targetMessages?: number;
  existingSummaries?: RoomSummary[];
}

export interface CompactionSelection {
  messages: Message[];
  range?: RoomCompactRange;
  reason?: string;
  keepRecent: number;
}

export interface CreateDeterministicSummaryInput {
  id: string;
  roomId: string;
  messages: Message[];
  createdAt: string;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function getLatestSummary(summaries: RoomSummary[]): RoomSummary | undefined {
  return [...summaries].sort((left, right) => {
    const byDate = left.created_at.localeCompare(right.created_at);
    if (byDate !== 0) {
      return byDate;
    }
    return left.id.localeCompare(right.id);
  }).at(-1);
}

export function selectCompactionRange(
  messages: Message[],
  options: SelectCompactionRangeOptions = {},
): CompactionSelection {
  const keepRecent = normalizePositiveInteger(
    options.keepRecent,
    DEFAULT_KEEP_RECENT_MESSAGES,
  );

  if (messages.length <= keepRecent) {
    return {
      messages: [],
      keepRecent,
      reason: "消息数量未超过保留窗口",
    };
  }

  const latestSummary = getLatestSummary(options.existingSummaries ?? []);
  const latestEndIndex = latestSummary
    ? messages.findIndex((message) => message.id === latestSummary.end_message_id)
    : -1;
  const startIndex = latestEndIndex >= 0 ? latestEndIndex + 1 : 0;
  const endExclusive = Math.max(startIndex, messages.length - keepRecent);
  let selected = messages.slice(startIndex, endExclusive);

  if (selected.length === 0) {
    return {
      messages: [],
      keepRecent,
      reason: "没有新的可压缩消息",
    };
  }

  const targetMessages = normalizePositiveInteger(
    options.targetMessages,
    selected.length,
  );
  selected = selected.slice(0, targetMessages);

  const first = selected[0];
  const last = selected.at(-1);
  if (!first || !last) {
    return {
      messages: [],
      keepRecent,
      reason: "没有新的可压缩消息",
    };
  }

  return {
    messages: selected,
    keepRecent,
    range: {
      start_message_id: first.id,
      end_message_id: last.id,
      message_count: selected.length,
    },
  };
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function formatMessageLine(message: Message): string {
  const sender = message.is_system
    ? "系统"
    : message.character_name || message.character_id || "未知";
  const senderType = message.sender_type || (message.is_system ? "system" : "ai");
  return `- ${message.timestamp} [${sender}/${senderType}] ${truncate(
    compactWhitespace(message.content),
    MAX_SUMMARY_LINE_CHARS,
  )}`;
}

export function buildDeterministicSummary(messages: Message[]): string {
  if (messages.length === 0) {
    return "";
  }

  const first = messages[0];
  const last = messages.at(-1);
  const participants = Array.from(
    new Set(messages.map((message) => message.character_name).filter(Boolean)),
  ).join("、") || "无";
  const lines = messages.slice(0, MAX_SUMMARY_LINES).map(formatMessageLine);
  const omitted = messages.length - lines.length;

  return [
    "[历史摘要 / Compact]",
    `范围：${first?.timestamp ?? ""} -> ${last?.timestamp ?? ""}，共 ${messages.length} 条消息。`,
    `参与者：${participants}`,
    "要点：",
    ...lines,
    omitted > 0 ? `- ...另有 ${omitted} 条消息已省略。` : "",
  ].filter(Boolean).join("\n");
}

export function createDeterministicRoomSummary(
  input: CreateDeterministicSummaryInput,
): RoomSummary {
  const first = input.messages[0];
  const last = input.messages.at(-1);
  if (!first || !last) {
    throw new Error("没有可压缩消息");
  }

  return {
    id: input.id,
    room_id: input.roomId,
    start_message_id: first.id,
    end_message_id: last.id,
    message_count: input.messages.length,
    summary: buildDeterministicSummary(input.messages),
    source: "deterministic",
    created_at: input.createdAt,
  };
}
