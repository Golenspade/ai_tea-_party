import type { CharacterFormData, VariableDisplay } from "@ai-party/shared";
import { VariableDisplaySchema } from "@ai-party/shared";

import { loadAppConfig, toCharacterFormData, type ConfigRoom } from "./config-loader";

export interface ConfigBootstrapAdapter {
  getRoom: (roomId: string) => unknown;
  createRoom: (
    name: string,
    description: string,
    options: {
      id: string;
      stealth_mode: boolean;
      user_description: string;
      max_history: number;
      created_at: string;
    },
  ) => void;
  addCharacterToRoom: (roomId: string, data: CharacterFormData) => void;
  setVariable?: (scope: "room", roomId: string, name: string, value: unknown) => void;
  setRoomVariableDisplays?: (roomId: string, displays: VariableDisplay[]) => void;
}

export function bootstrapRoomsFromConfig(
  adapter: ConfigBootstrapAdapter,
  configPath?: string,
  now: () => string = () => new Date().toISOString(),
): boolean {
  const config = loadAppConfig(configPath);
  const rooms = config?.rooms;
  if (!rooms?.length) {
    return false;
  }

  for (const roomConfig of rooms) {
    bootstrapRoom(adapter, roomConfig, now);
  }

  return true;
}

function bootstrapRoom(
  adapter: ConfigBootstrapAdapter,
  roomConfig: ConfigRoom,
  now: () => string,
): void {
  const roomId = roomConfig.id?.trim();
  if (!roomId || adapter.getRoom(roomId)) {
    return;
  }

  adapter.createRoom(roomConfig.name || "Unnamed Room", roomConfig.description || "", {
    id: roomId,
    stealth_mode: roomConfig.stealth_mode ?? false,
    user_description: roomConfig.user_description || "",
    max_history: 50,
    created_at: now(),
  });

  for (const characterConfig of roomConfig.characters || []) {
    if (!characterConfig.name?.trim()) {
      continue;
    }
    adapter.addCharacterToRoom(roomId, toCharacterFormData(characterConfig));
  }

  for (const variable of roomConfig.room_variables || []) {
    const name = String(variable.name || "").trim();
    if (!name || !adapter.setVariable) continue;
    adapter.setVariable("room", roomId, name, variable.value);
  }

  if (roomConfig.variable_displays && adapter.setRoomVariableDisplays) {
    const parsed = VariableDisplaySchema.array().safeParse(roomConfig.variable_displays);
    if (parsed.success) {
      adapter.setRoomVariableDisplays(roomId, parsed.data);
    }
  }
}
