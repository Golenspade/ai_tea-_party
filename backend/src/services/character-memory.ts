import type { Character, Message } from "@ai-party/shared";

export interface CharacterProfile {
  name: string;
  traits: string[];
  lastUpdated: string;
}

export class CharacterMemory {
  private readonly characterProfiles = new Map<string, CharacterProfile>();

  updateCharacterProfile(characterId: string, name: string, traits: string[]): void {
    this.characterProfiles.set(characterId, {
      name,
      traits,
      lastUpdated: new Date().toISOString(),
    });
  }

  getCharacterContext(characterId: string): string {
    const profile = this.characterProfiles.get(characterId);
    if (!profile || profile.traits.length === 0) {
      return "";
    }

    return `${profile.name}的特征：${profile.traits.join(", ")}`;
  }

  analyzeCharacterFromMessages(characterId: string, messages: Message[]): string[] {
    const characterMessages = messages.filter((message) => message.character_id === characterId);
    if (characterMessages.length === 0) {
      return [];
    }

    const traits: string[] = [];
    const contentText = characterMessages.map((message) => message.content).join(" ");

    if (contentText.includes("哈哈") || contentText.includes("😄")) {
      traits.push("幽默开朗");
    }
    if (contentText.includes("谢谢") || contentText.includes("感谢")) {
      traits.push("礼貌");
    }

    if (contentText.length / characterMessages.length > 50) {
      traits.push("健谈");
    } else {
      traits.push("简洁");
    }

    return traits;
  }
}

export function updateCharacterMemoryFromHistory(memory: CharacterMemory, conversationHistory: Message[]): void {
  const recent = conversationHistory.slice(-20);
  const activeCharacters = new Map<string, string>();

  for (const message of recent) {
    if (!message.is_system) {
      activeCharacters.set(message.character_id, message.character_name);
    }
  }

  for (const [characterId, characterName] of activeCharacters) {
    const traits = memory.analyzeCharacterFromMessages(characterId, recent);
    if (traits.length > 0) {
      memory.updateCharacterProfile(characterId, characterName, traits);
    }
  }
}

export function getCharacterMemoryContext(
  memory: CharacterMemory,
  currentCharacterId: string,
  conversationHistory: Message[],
): string {
  const memoryLines: string[] = [];
  const otherCharacters = new Map<string, string>();

  for (const message of conversationHistory) {
    if (!message.is_system && message.character_id !== currentCharacterId) {
      otherCharacters.set(message.character_id, message.character_name);
    }
  }

  for (const [characterId, characterName] of otherCharacters) {
    const context = memory.getCharacterContext(characterId);
    if (context) {
      memoryLines.push(context);
      continue;
    }

    const characterMessages = conversationHistory
      .slice(-15)
      .filter((message) => message.character_id === characterId);
    if (characterMessages.length > 0) {
      const recentContent = characterMessages
        .slice(-3)
        .map((message) => message.content)
        .join(" ");
      memoryLines.push(`${characterName}最近说过：${recentContent}`);
    }
  }

  return memoryLines.length > 0 ? memoryLines.join("\n") : "暂无其他角色的详细信息";
}

export function analyzeConversationContext(recentMessages: Message[], character: Character): string {
  if (recentMessages.length === 0) {
    return "对话刚开始，建议主动开启话题";
  }

  const messageCount = recentMessages.length;
  const lastMessage = recentMessages[recentMessages.length - 1];
  const rhythm =
    messageCount <= 3 ? "对话初期" : messageCount <= 8 ? "对话进行中" : "对话深入";

  const analysisParts = [`对话状态：${rhythm}`];

  if (lastMessage && !lastMessage.is_system) {
    const lastContent = lastMessage.content;
    if (["?", "？", "吗", "呢"].some((token) => lastContent.includes(token))) {
      analysisParts.push("需要回答问题");
    }
    if (["哈哈", "开心", "高兴", "好的"].some((token) => lastContent.includes(token))) {
      analysisParts.push("氛围轻松愉快");
    } else if (["难过", "伤心", "不好", "糟糕"].some((token) => lastContent.includes(token))) {
      analysisParts.push("需要给予关怀");
    }

    if (lastContent.length > 50) {
      analysisParts.push("对方说得较多，可以详细回应");
    } else {
      analysisParts.push("对方简洁回复，保持简洁即可");
    }
  }

  const characterRecent = recentMessages
    .slice(-5)
    .filter((message) => message.character_id === character.id);
  if (characterRecent.length === 0) {
    analysisParts.push("你还未参与此轮对话");
  } else if (characterRecent.length >= 2) {
    analysisParts.push("你已经连续发言，可以让其他人说话");
  }

  return analysisParts.join("；");
}

export function buildSupplementalSystemMessages(
  memory: CharacterMemory,
  character: Character,
  conversationHistory: Message[],
): Array<{ role: "system"; content: string }> {
  const supplemental: Array<{ role: "system"; content: string }> = [];

  const memoryContext = getCharacterMemoryContext(memory, character.id, conversationHistory);
  if (memoryContext.trim()) {
    supplemental.push({
      role: "system",
      content: `【角色记忆】\n${memoryContext}`,
    });
  }

  const contextAnalysis = analyzeConversationContext(conversationHistory.slice(-10), character);
  if (contextAnalysis.trim()) {
    supplemental.push({
      role: "system",
      content: `【对话情境分析】\n${contextAnalysis}`,
    });
  }

  return supplemental;
}
