// 共享类型定义 — 与后端 models/ 对齐

export interface ExampleDialogue {
  user_message: string;
  character_response: string;
}

export interface Character {
  id: string;
  name: string;
  personality: string;
  background: string;
  speaking_style?: string;
  // CharacterCard 扩展
  description?: string;
  scenario?: string;
  system_prompt_override?: string;
  post_instructions?: string;
  greeting?: string;
  creator_notes?: string;
  tags?: string[];
  example_dialogues?: ExampleDialogue[];
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
}

export interface WorldInfoEntry {
  id: string;
  keys: string[];
  secondary_keys: string[];
  selective_logic: string;
  content: string;
  position: string;
  depth: number;
  enabled: boolean;
  constant: boolean;
  order: number;
}

export interface WorldInfoBook {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  entries: WorldInfoEntry[];
}

export interface Message {
  id: string;
  character_id: string;
  character_name: string;
  content: string;
  timestamp: string;
  is_system?: boolean;
}

export type VariableScope = "room" | "global";

export interface VariableEntry {
  name: string;
  value: unknown;
  scope: VariableScope;
}

export interface VariableSetRequest {
  name: string;
  value: unknown;
}

export interface VariablePatchRequest {
  name: string;
  value: unknown;
}

export interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  apiBase?: string;
}

export interface ProviderDef {
  name: string;
  prefix: string;
  env_key: string;
  models: string[];
  default: string;
  context_tokens: number;
  description: string;
  custom_model?: boolean;
  needs_api_base?: boolean;
  default_api_base?: string;
}

export interface CharacterFormData {
  name: string;
  personality: string;
  background: string;
  speaking_style: string;
  // CharacterCard 扩展
  description?: string;
  scenario?: string;
  system_prompt_override?: string;
  post_instructions?: string;
  greeting?: string;
  creator_notes?: string;
  tags?: string[];
  example_dialogues?: ExampleDialogue[];
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
