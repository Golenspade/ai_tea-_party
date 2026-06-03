// 共享类型定义 — 与后端和前端模型对齐（通过 packages/shared）

export type {
  ExampleDialogue,
  Character,
  CharacterFormData,
  Persona,
  WorldInfoEntry,
  WorldInfoBook,
  Message,
  VariableScope,
  VariableEntry,
  VariableSetRequest,
  VariablePatchRequest,
  ProviderDef,
  PresenceUser,
  WsMessage,
} from "@ai-party/shared";

// --- API 配置 ---

export interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  apiBase?: string;
}

// --- 工具函数 ---

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-indigo-500",
];

export function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function getCharacterInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
