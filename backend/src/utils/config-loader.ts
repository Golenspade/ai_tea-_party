import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { CharacterFormData, VariableDisplay } from "@ai-party/shared";

export interface ConfigRoomCharacter {
  name: string;
  personality?: string;
  background?: string;
  speaking_style?: string;
  description?: string;
  scenario?: string;
}

export interface ConfigRoomVariable {
  name: string;
  value: unknown;
  scope?: "room" | "global";
}

export interface ConfigRoom {
  id: string;
  name: string;
  description?: string;
  stealth_mode?: boolean;
  user_description?: string;
  characters?: ConfigRoomCharacter[];
  room_variables?: ConfigRoomVariable[];
  global_variables?: ConfigRoomVariable[];
  variable_displays?: VariableDisplay[];
}

export interface AppConfigFile {
  rooms?: ConfigRoom[];
}

export function resolveConfigPath(customPath?: string): string {
  const candidates = [
    customPath,
    process.env.CONFIG_PATH,
    resolve(process.cwd(), "config.json"),
    resolve(process.cwd(), "..", "config.json"),
  ].filter((item): item is string => Boolean(item?.trim()));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return resolve(process.cwd(), "..", "config.json");
}

export function loadAppConfig(configPath?: string): AppConfigFile | null {
  const resolvedPath = resolveConfigPath(configPath);
  if (!existsSync(resolvedPath)) {
    return null;
  }

  try {
    const raw = readFileSync(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw) as AppConfigFile;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function toCharacterFormData(character: ConfigRoomCharacter): CharacterFormData {
  return {
    name: character.name,
    personality: character.personality || "",
    background: character.background || "",
    speaking_style: character.speaking_style || "",
    description: character.description || "",
    scenario: character.scenario || "",
  };
}
