import type { Character, ChatRoom, Message } from "@ai-party/shared";

export function chooseNextSpeaker(
  room: ChatRoom,
  pendingCharacterId?: string,
): { character: Character; source: "user" | "dm"; reason: string } | undefined {
  const activeCharacters = room.characters.filter((character) => character.is_active !== false);
  if (activeCharacters.length === 0) {
    return undefined;
  }

  if (pendingCharacterId) {
    const designated = activeCharacters.find((character) => character.id === pendingCharacterId);
    if (designated) {
      return {
        character: designated,
        source: "user",
        reason: "用户指定下轮发言者",
      };
    }
  }

  const lastSpeakerId = findLastAiSpeakerId(room.messages);
  if (!lastSpeakerId) {
    return {
      character: activeCharacters[0],
      source: "dm",
      reason: "DM 选择首位可用角色",
    };
  }

  const lastIndex = activeCharacters.findIndex((character) => character.id === lastSpeakerId);
  const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % activeCharacters.length : 0;
  return {
    character: activeCharacters[nextIndex],
    source: "dm",
    reason: "DM 根据上一位发言者选择下一位",
  };
}

function findLastAiSpeakerId(messages: Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.sender_type === "ai" && !message.is_system) {
      return message.character_id;
    }
  }
  return undefined;
}
