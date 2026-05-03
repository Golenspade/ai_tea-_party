import type {
  Character,
  CharacterFormData,
  ApiConfig,
  ProviderDef,
  Persona,
  WorldInfoBook,
  WorldInfoEntry,
  VariableEntry,
  VariablePatchRequest,
  VariableSetRequest,
  VariableScope,
} from "@/lib/types";

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

// --- 生成设置 ---

export type ResponseLength = "short" | "default" | "long";

export async function fetchSettings(): Promise<{ response_length: ResponseLength }> {
  const res = await fetch(`${BASE_URL}/api/settings`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function setResponseLength(length: ResponseLength): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_length: length }),
  });
  if (!res.ok) throw new Error("Failed to update response length");
}

// --- 变量 API ---

export async function fetchRoomVariables(roomId = "default"): Promise<VariableEntry[]> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/variables`);
  if (!res.ok) throw new Error("Failed to fetch room variables");
  const data = await res.json();
  return data.variables || [];
}

export async function createRoomVariable(
  roomId: string,
  payload: VariableSetRequest,
): Promise<VariableEntry> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create room variable");
  return res.json();
}

export async function setVariable(
  roomId: string,
  scope: VariableScope,
  payload: VariableSetRequest,
): Promise<VariableEntry> {
  if (scope === "global") {
    const res = await fetch(`${BASE_URL}/api/variables/global/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to set global variable");
    return res.json();
  }

  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/variables/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to set room variable");
  return res.json();
}

export async function addVariable(
  roomId: string,
  scope: VariableScope,
  payload: VariablePatchRequest,
): Promise<VariableEntry> {
  const endpoint =
    scope === "global"
      ? `${BASE_URL}/api/variables/global/add`
      : `${BASE_URL}/api/rooms/${roomId}/variables/add`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add variable");
  return res.json();
}

export async function incVariable(
  roomId: string,
  scope: VariableScope,
  payload: VariablePatchRequest,
): Promise<VariableEntry> {
  const endpoint =
    scope === "global"
      ? `${BASE_URL}/api/variables/global/inc`
      : `${BASE_URL}/api/rooms/${roomId}/variables/inc`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to increment variable");
  return res.json();
}

export async function decVariable(
  roomId: string,
  scope: VariableScope,
  payload: VariablePatchRequest,
): Promise<VariableEntry> {
  const endpoint =
    scope === "global"
      ? `${BASE_URL}/api/variables/global/dec`
      : `${BASE_URL}/api/rooms/${roomId}/variables/dec`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to decrement variable");
  return res.json();
}

export async function deleteVariable(
  roomId: string,
  scope: VariableScope,
  name: string,
): Promise<void> {
  const endpoint =
    scope === "global"
      ? `${BASE_URL}/api/variables/global/${encodeURIComponent(name)}`
      : `${BASE_URL}/api/rooms/${roomId}/variables/${encodeURIComponent(name)}`;

  const res = await fetch(endpoint, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete variable");
}

export async function fetchGlobalVariables(): Promise<VariableEntry[]> {
  const res = await fetch(`${BASE_URL}/api/variables/global`);
  if (!res.ok) throw new Error("Failed to fetch global variables");
  const data = await res.json();
  return data.variables || [];
}

// --- Persona API ---

export async function fetchPersonas(): Promise<Persona[]> {
  const res = await fetch(`${BASE_URL}/api/personas`);
  if (!res.ok) throw new Error("Failed to fetch personas");
  return res.json();
}

export async function createPersona(data: { name: string; description: string; is_default?: boolean }): Promise<Persona> {
  const res = await fetch(`${BASE_URL}/api/personas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create persona");
  const json = await res.json();
  return json.persona;
}

export async function updatePersona(id: string, data: { name: string; description: string; is_default?: boolean }): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/personas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update persona");
}

export async function deletePersona(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/personas/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete persona");
}

// --- World Info API ---

export async function fetchWorldInfoBooks(): Promise<WorldInfoBook[]> {
  const res = await fetch(`${BASE_URL}/api/world-info`);
  if (!res.ok) throw new Error("Failed to fetch world info books");
  return res.json();
}

export async function createWorldInfoBook(data: { name: string; description?: string }): Promise<WorldInfoBook> {
  const res = await fetch(`${BASE_URL}/api/world-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create world info book");
  const json = await res.json();
  return json.book;
}

export async function updateWorldInfoBook(id: string, data: { name: string; description?: string; enabled?: boolean }): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/world-info/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update world info book");
}

export async function deleteWorldInfoBook(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/world-info/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete world info book");
}

// --- World Info Entries ---

export async function createWorldInfoEntry(bookId: string, data: Partial<WorldInfoEntry>): Promise<WorldInfoEntry> {
  const res = await fetch(`${BASE_URL}/api/world-info/${bookId}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create entry");
  const json = await res.json();
  return json.entry;
}

export async function updateWorldInfoEntry(bookId: string, entryId: string, data: Partial<WorldInfoEntry>): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/world-info/${bookId}/entries/${entryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update entry");
}

export async function deleteWorldInfoEntry(bookId: string, entryId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/world-info/${bookId}/entries/${entryId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete entry");
}

// --- Room ↔ WorldInfo ---

export async function fetchRoomWorldInfo(roomId: string): Promise<WorldInfoBook[]> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/world-info`);
  if (!res.ok) throw new Error("Failed to fetch room world info");
  return res.json();
}

export async function updateRoomWorldInfo(roomId: string, bookIds: string[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/world-info`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_ids: bookIds }),
  });
  if (!res.ok) throw new Error("Failed to update room world info");
}

export { BASE_URL };
