// 共享类型定义 — 与后端 models/character.py 对齐

export interface Character {
  id: string;
  name: string;
  personality: string;
  background: string;
  speaking_style?: string;
}

export interface Message {
  id: string;
  character_id: string;
  character_name: string;
  content: string;
  timestamp: string;
  is_system?: boolean;
}

export interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export interface CharacterFormData {
  name: string;
  personality: string;
  background: string;
  speaking_style: string;
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
