import { randomUUID } from "node:crypto";

import type { Character, Message } from "@ai-party/shared";

export type RoomSenderType = "ai" | "user" | "system";

export interface WriteToRoomInput {
  content: string;
  character_id?: string;
  sender_type?: RoomSenderType;
}

export interface WriteToRoomContext {
  roomId: string;
  speakingCharacter: Character;
  characters: Character[];
  now?: () => string;
}

const SYSTEM_CHARACTER_ID = "system";
const NARRATOR_NAME = "旁白";

export function parseWriteToRoomInput(args: Record<string, unknown>): WriteToRoomInput {
  if (typeof args.content !== "string") {
    throw new Error("content 不能为空");
  }

  const content = args.content.trim();
  if (!content) {
    throw new Error("content 不能为空");
  }

  const sender_type = parseSenderType(args.sender_type);
  const character_id =
    typeof args.character_id === "string" && args.character_id.trim()
      ? args.character_id.trim()
      : undefined;

  return { content, character_id, sender_type };
}

function parseSenderType(value: unknown): RoomSenderType | undefined {
  if (value === "ai" || value === "user" || value === "system") {
    return value;
  }
  return undefined;
}

export function buildWriteToRoomMessage(
  input: WriteToRoomInput,
  context: WriteToRoomContext,
): Message {
  const timestamp = context.now?.() ?? new Date().toISOString();
  const senderType = input.sender_type ?? "ai";

  if (senderType === "system") {
    return {
      id: randomUUID(),
      character_id: SYSTEM_CHARACTER_ID,
      character_name: NARRATOR_NAME,
      content: input.content,
      timestamp,
      is_system: true,
      sender_type: "system",
      sender_user_id: "agent",
    };
  }

  const character = resolveCharacter(input.character_id, context);
  const isUser = senderType === "user";

  return {
    id: randomUUID(),
    character_id: character.id,
    character_name: character.name,
    content: input.content,
    timestamp,
    is_system: false,
    sender_type: isUser ? "user" : "ai",
    sender_user_id: isUser ? "user" : "agent",
  };
}

function resolveCharacter(characterId: string | undefined, context: WriteToRoomContext): Character {
  if (characterId) {
    const match = context.characters.find((item) => item.id === characterId);
    if (!match) {
      throw new Error(`角色不存在: ${characterId}`);
    }
    return match;
  }

  return context.speakingCharacter;
}
