// REST API 服务层 — 封装对后端 rest.py 的所有 HTTP 请求

import type { Character, CharacterFormData, ApiConfig, ProviderDef } from "@/lib/types";

const BASE_URL = "http://localhost:3004";

// --- 角色 API ---

export async function fetchCharacters(roomId = "default"): Promise<Character[]> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/characters`);
  if (!res.ok) throw new Error("Failed to fetch characters");
  return res.json();
}

export async function addCharacter(
  data: CharacterFormData,
  roomId = "default",
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to add character");
}

export async function deleteCharacter(
  characterId: string,
  roomId = "default",
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/rooms/${roomId}/characters/${characterId}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error("Failed to delete character");
}

// --- 消息 API ---

export async function sendMessage(
  characterId: string,
  content: string,
  roomId = "default",
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id: characterId, content }),
  });
  if (!res.ok) throw new Error("Failed to send message");
}

export async function clearMessages(roomId = "default"): Promise<void> {
  await fetch(`${BASE_URL}/api/rooms/${roomId}/messages`, {
    method: "DELETE",
  });
}

// --- AI 流式生成 ---

export function streamAIResponse(
  characterId: string,
  roomId = "default",
): Promise<Response> {
  return fetch(`${BASE_URL}/api/rooms/${roomId}/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character_id: characterId }),
  });
}

// --- 自动聊天 ---

export async function startAutoChat(roomId = "default"): Promise<void> {
  await fetch(`${BASE_URL}/api/rooms/${roomId}/auto-chat/start`, {
    method: "POST",
  });
}

export async function stopAutoChat(roomId = "default"): Promise<void> {
  await fetch(`${BASE_URL}/api/rooms/${roomId}/auto-chat/stop`, {
    method: "POST",
  });
}

// --- Provider / 配置 API ---

export async function fetchProviders(): Promise<Record<string, ProviderDef>> {
  const res = await fetch(`${BASE_URL}/api/providers`);
  if (!res.ok) throw new Error("Failed to fetch providers");
  const data = await res.json();
  return data.providers;
}

export async function fetchCurrentConfig(): Promise<{ current_config: Record<string, unknown> | null; providers: Record<string, ProviderDef> }> {
  const res = await fetch(`${BASE_URL}/api/config`);
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

export async function saveApiConfig(config: ApiConfig): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: config.provider,
      api_key: config.apiKey,
      model: config.model || undefined,
      api_base: config.apiBase || undefined,
    }),
  });
  if (!res.ok) throw new Error("Failed to save API config");
}

export { BASE_URL };

