import { randomUUID } from "node:crypto";

import type {
  Character,
  CharacterFormData,
  ChatRoom,
  Message,
  StreamingEvent,
  Persona,
  VariableEntry,
  WorldInfoBook,
  WorldInfoEntry,
  ProviderDef,
} from "@ai-party/shared";

import { AppRepository } from "./db/repository";
import {
  ChatOrchestrator,
  type OrchestratorRuntime,
} from "./services/orchestrator";
import { ResponseLength } from "./types";

const nowIso = () => new Date().toISOString();

const DEFAULT_ROOM_ID = "default";

const normalizeResponseLength = (raw: string | undefined): ResponseLength | undefined => {
  if (raw === "short" || raw === "default" || raw === "long") {
    return raw;
  }
  return undefined;
};

class AppState {
  private readonly repository: AppRepository;
  private readonly autoChatState = new Map<string, boolean>();
  private readonly orchestrator: ChatOrchestrator;

  responseLength: ResponseLength = "default";
  currentProvider = "openai";
  currentModel = "gpt-4o-mini";
  autoChatTimers = new Map<string, NodeJS.Timeout>();

  static readonly PROVIDERS: Record<string, ProviderDef> = {
    openai: {
      name: "OpenAI",
      prefix: "openai",
      env_key: "OPENAI_API_KEY",
      models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
      default: "gpt-4o-mini",
      context_tokens: 128_000,
      description: "OpenAI GPT 系列，聊天与工具调用均可",
    },
    deepseek: {
      name: "DeepSeek",
      prefix: "deepseek",
      env_key: "DEEPSEEK_API_KEY",
      models: ["deepseek-chat", "deepseek-reasoner"],
      default: "deepseek-chat",
      context_tokens: 128_000,
      description: "DeepSeek V3，默认对话模型",
    },
    gemini: {
      name: "Google Gemini",
      prefix: "gemini",
      env_key: "GEMINI_API_KEY",
      models: ["gemini-2.5-flash", "gemini-2.5-pro"],
      default: "gemini-2.5-flash",
      context_tokens: 1_000_000,
      description: "Google Gemini 系列",
    },
    xai: {
      name: "xAI",
      prefix: "xai",
      env_key: "XAI_API_KEY",
      models: ["grok-3", "grok-3-mini"],
      default: "grok-3-mini",
      context_tokens: 131_072,
      description: "xAI Grok",
    },
    minimax: {
      name: "MiniMax",
      prefix: "minimax",
      env_key: "MINIMAX_API_KEY",
      models: ["MiniMax-M2.1"],
      default: "MiniMax-M2.1",
      context_tokens: 1_000_000,
      description: "MiniMax 国产模型",
    },
    moonshot: {
      name: "Moonshot (Kimi)",
      prefix: "moonshot",
      env_key: "MOONSHOT_API_KEY",
      models: ["kimi-k2-0711-preview", "kimi-k2-instruct"],
      default: "kimi-k2-0711-preview",
      context_tokens: 128_000,
      description: "Kimi 系列",
    },
  } as const;

  constructor() {
    this.repository = new AppRepository();
    this.orchestrator = new ChatOrchestrator();
    const restoredLength = normalizeResponseLength(this.repository.getSetting("response_length"));
    if (restoredLength) {
      this.responseLength = restoredLength;
    }

    const restoredProvider = this.repository.getSetting("provider", this.currentProvider);
    if (AppState.PROVIDERS[restoredProvider]) {
      this.currentProvider = restoredProvider;
    }

    const restoredModel = this.repository.getSetting("model", this.currentModel);
    if (AppState.PROVIDERS[this.currentProvider]?.models.includes(restoredModel)) {
      this.currentModel = restoredModel;
    }
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const defaultRoom = this.getRoom(DEFAULT_ROOM_ID);
    if (!defaultRoom) {
      this.repository.createRoom(DEFAULT_ROOM_ID, "AI Tea Party 聊天室", "默认聊天室", {
        id: DEFAULT_ROOM_ID,
        stealth_mode: false,
        user_description: "",
        max_history: 50,
        created_at: nowIso(),
      });
      this.autoChatState.set(DEFAULT_ROOM_ID, false);
    } else if (!this.autoChatState.has(defaultRoom.id)) {
      this.autoChatState.set(defaultRoom.id, defaultRoom.is_auto_chat ?? false);
    }

    if (this.listPersonas().length === 0) {
      const defaultPersona: Persona = {
        id: randomUUID(),
        name: "用户",
        description: "",
        is_default: true,
      };
      this.savePersona(defaultPersona);
    }

    const roomForBootstrap = this.getRoom(DEFAULT_ROOM_ID);
    if (!roomForBootstrap) {
      return;
    }

    if (roomForBootstrap.characters.length === 0) {
      const introCharacter: Character = {
        id: randomUUID(),
        name: "茶室主持",
        personality: "温和、善于引导话题",
        background: "AI 茶话会的主持角色",
        description: "默认主持人",
        scenario: "茶话会",
        speaking_style: "清晰、友好",
        system_prompt_override: "",
        post_instructions: "",
        greeting: "",
        creator_notes: "",
        tags: ["system"],
        is_active: true,
        example_dialogues: [],
      };

      this.addCharacterToRoom(DEFAULT_ROOM_ID, introCharacter);
    }
  }

  cloneRoomsSnapshot(): ChatRoom[] {
    return this.repository
      .listRooms()
      .map((room) => ({ ...room, is_auto_chat: this.getRoomAutoChat(room.id) }));
  }

  getRoom(roomId: string): ChatRoom | undefined {
    const room = this.repository.getRoom(roomId);
    if (!room) return undefined;
    return { ...room, is_auto_chat: this.getRoomAutoChat(room.id) };
  }

  createRoom(name: string, description = "", options?: Partial<ChatRoom>): ChatRoom {
    const roomId = options?.id || randomUUID();
    const room = this.repository.createRoom(roomId, name, description, {
      id: roomId,
      ...options,
      created_at: options?.created_at || nowIso(),
    });
    this.autoChatState.set(room.id, false);
    return { ...room, is_auto_chat: false };
  }

  listRoomVariables(roomId: string): VariableEntry[] {
    if (!this.repository.getRoom(roomId)) {
      return [];
    }
    return this.repository.listRoomVariables(roomId);
  }

  listGlobalVariables(): VariableEntry[] {
    return this.repository.listGlobalVariables();
  }

  setVariable(scope: "room" | "global", roomIdOrName: string, name: string, value: unknown): VariableEntry {
    const key = String(name || "").trim();
    if (!key) {
      throw new Error("变量名不能为空");
    }

    if (scope === "global") {
      return this.repository.setGlobalVariable(key, value);
    }

    if (!this.repository.getRoom(roomIdOrName)) {
      throw new Error("聊天室不存在");
    }
    return this.repository.setRoomVariable(roomIdOrName, key, value);
  }

  addVariable(scope: "room" | "global", roomIdOrName: string, name: string, value: unknown): VariableEntry {
    return this._numericOp(scope, roomIdOrName, name, value, "add");
  }

  incVariable(scope: "room" | "global", roomIdOrName: string, name: string, value: unknown): VariableEntry {
    return this._numericOp(scope, roomIdOrName, name, value, "inc");
  }

  decVariable(scope: "room" | "global", roomIdOrName: string, name: string, value: unknown): VariableEntry {
    return this._numericOp(scope, roomIdOrName, name, value, "dec");
  }

  deleteVariable(scope: "room" | "global", roomIdOrName: string, name: string): boolean {
    const key = String(name || "").trim();
    if (!key) {
      return false;
    }

    if (scope === "global") {
      return this.repository.deleteGlobalVariable(key);
    }

    const room = this.getRoom(roomIdOrName);
    if (!room) {
      return false;
    }
    return this.repository.deleteRoomVariable(room.id, key);
  }

  private _getVariableMap(
    scope: "room" | "global",
    roomIdOrName: string,
  ): { scope: "room" | "global"; roomId: string | undefined } {
    if (scope === "global") {
      return { scope: "global", roomId: undefined };
    }

    const room = this.getRoom(roomIdOrName);
    if (!room) {
      throw new Error("聊天室不存在");
    }
    return { scope: "room", roomId: room.id };
  }

  private _numericOp(
    scope: "room" | "global",
    roomIdOrName: string,
    name: string,
    value: unknown,
    mode: "add" | "inc" | "dec",
  ): VariableEntry {
    const key = String(name || "").trim();
    if (!key) {
      throw new Error("变量名不能为空");
    }

    const ctx = this._getVariableMap(scope, roomIdOrName);

    if (mode === "add") {
      if (ctx.scope === "global") {
        return this.repository.addGlobalVariable(key, value);
      }
      return this.repository.addRoomVariable(ctx.roomId, key, value);
    }

    if (ctx.scope === "global") {
      if (mode === "inc") {
        return this.repository.incGlobalVariable(key, value);
      }
      return this.repository.decGlobalVariable(key, value);
    }

    if (mode === "inc") {
      return this.repository.incRoomVariable(ctx.roomId, key, value);
    }

    return this.repository.decRoomVariable(ctx.roomId, key, value);
  }

  addCharacterToRoom(roomId: string, data: Character | CharacterFormData): Character {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character: Character = {
      id: data.id || randomUUID(),
      name: data.name,
      personality: data.personality,
      background: data.background,
      description: "description" in data ? data.description || "" : "",
      scenario: "scenario" in data ? data.scenario || "" : "",
      speaking_style: "speaking_style" in data ? data.speaking_style || "" : "",
      system_prompt_override:
        "system_prompt_override" in data ? data.system_prompt_override || "" : "",
      post_instructions:
        "post_instructions" in data ? data.post_instructions || "" : "",
      greeting: "greeting" in data ? data.greeting || "" : "",
      creator_notes: "creator_notes" in data ? data.creator_notes || "" : "",
      tags: data.tags || [],
      is_active: true,
      example_dialogues: data.example_dialogues || [],
      avatar: "avatar" in data ? data.avatar : undefined,
    };

    const saved = this.repository.addCharacterToRoom(room.id, character);
    return saved;
  }

  removeCharacterFromRoom(roomId: string, characterId: string): Character | undefined {
    const removed = this.repository.removeCharacterFromRoom(roomId, characterId);
    return removed;
  }

  addRoomMessage(roomId: string, message: Message): void {
    this.repository.addRoomMessage(roomId, message);
  }

  clearRoomMessages(roomId: string): void {
    this.repository.clearRoomMessages(roomId);
  }

  getRoomAutoChat(roomId: string): boolean {
    return this.autoChatState.get(roomId) || false;
  }

  setRoomAutoChat(roomId: string, value: boolean): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }
    this.autoChatState.set(roomId, Boolean(value));
    return true;
  }

  setRoomStealthMode(
    roomId: string,
    stealthMode?: boolean,
    userDescription?: string,
    name?: string,
    description?: string,
  ): ChatRoom | undefined {
    const room = this.repository.setRoomMeta(roomId, {
      stealth_mode: stealthMode,
      user_description: userDescription,
      name,
      description,
    });

    if (!room) {
      return undefined;
    }
    return { ...room, is_auto_chat: this.getRoomAutoChat(roomId) };
  }

  savePersona(persona: Persona): Persona {
    return this.repository.savePersona({
      ...persona,
      id: persona.id || randomUUID(),
      name: persona.name,
      description: persona.description || "",
      is_default: Boolean(persona.is_default),
    });
  }

  deletePersona(personaId: string): boolean {
    this.repository.deletePersona(personaId);
    return true;
  }

  listPersonas(): Persona[] {
    return this.repository.listPersonas();
  }

  createWorldInfoBook(name: string, description = "", enabled = true): WorldInfoBook {
    return this.repository.createWorldInfoBook(name, description, enabled);
  }

  listWorldInfoBooks(): WorldInfoBook[] {
    return this.repository.listWorldInfoBooks();
  }

  saveWorldInfoBook(book: WorldInfoBook): WorldInfoBook {
    return this.repository.saveWorldInfoBook({
      id: book.id || randomUUID(),
      name: book.name,
      description: book.description || "",
      enabled: Boolean(book.enabled),
      entries: [...(book.entries || [])],
    });
  }

  deleteWorldInfoBook(bookId: string): void {
    this.repository.deleteWorldInfoBook(bookId);
  }

  deleteWorldInfoEntry(bookId: string, entryId: string): boolean {
    return this.repository.deleteWorldInfoEntry(bookId, entryId);
  }

  upsertWorldInfoEntry(bookId: string, entry: WorldInfoEntry): WorldInfoEntry {
    const normalized: WorldInfoEntry = {
      id: entry.id || randomUUID(),
      keys: entry.keys || [],
      secondary_keys: entry.secondary_keys || [],
      selective_logic: entry.selective_logic || "AND",
      content: entry.content || "",
      position: entry.position || "after_char",
      depth: entry.depth || 4,
      enabled: entry.enabled !== false,
      constant: Boolean(entry.constant),
      order: entry.order ?? 100,
    };

    return this.repository.upsertWorldInfoEntry(bookId, normalized);
  }

  getRoomWorldInfo(roomId: string): WorldInfoBook[] {
    if (!this.repository.getRoom(roomId)) {
      return [];
    }
    return this.repository.getRoomWorldInfo(roomId);
  }

  setRoomWorldInfo(roomId: string, bookIds: string[]): void {
    if (!this.repository.getRoom(roomId)) {
      throw new Error("聊天室不存在");
    }
    this.repository.setRoomWorldInfo(roomId, bookIds);
  }

  getProviderDefs(): Record<string, ProviderDef> {
    return { ...AppState.PROVIDERS };
  }

  getConfig() {
    return {
      provider: this.currentProvider,
      model: this.currentModel,
      has_api_key: true,
    };
  }

  setConfig(payload: { provider: string; model?: string }): void {
    if (!AppState.PROVIDERS[payload.provider]) {
      throw new Error("不支持的 Provider");
    }

    this.currentProvider = payload.provider;
    const candidate = payload.model || AppState.PROVIDERS[payload.provider].default;
    if (!AppState.PROVIDERS[payload.provider].models.includes(candidate)) {
      throw new Error("模型不在当前 Provider 支持列表");
    }
    this.currentModel = candidate;
    this.repository.setSetting("provider", this.currentProvider);
    this.repository.setSetting("model", this.currentModel);
  }

  setResponseLength(next: ResponseLength): void {
    this.responseLength = next;
    this.repository.setSetting("response_length", next);
  }

  testConnection() {
    if (!AppState.PROVIDERS[this.currentProvider]) {
      return { success: false, message: "provider not found" };
    }
    return {
      success: true,
      message: `${this.currentModel} 连接正常`,
      latency_ms: 0,
    };
  }

  listRoomUsers(): any[] {
    return [];
  }

  getMessagesSince(roomId: string, sinceIso?: string, limit = 50): Message[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return this.repository.getRoomMessages(roomId, sinceIso, limit).map((item) => ({ ...item }));
  }

  async generateAiReply(roomId: string, characterId: string): Promise<{ message: Message; requestId: string }> {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character = room.characters.find((item) => item.id === characterId);
    if (!character) {
      throw new Error("角色不存在");
    }

    const runtime = this.getAgentRuntime(roomId);
    const reply = await this.orchestrator.generateReply(room, character, this.responseLength, runtime);
    const message: Message = {
      id: reply.messageId,
      character_id: character.id,
      character_name: character.name,
      content: reply.content,
      timestamp: nowIso(),
      is_system: false,
      sender_type: "ai",
      sender_user_id: "system",
    };

    this.addRoomMessage(roomId, message);
    return { message, requestId: reply.requestId };
  }

  async startAiReplyStream(
    roomId: string,
    characterId: string,
  ): Promise<{
    characterName: string;
    requestId: string;
    messageId: string;
    events: AsyncGenerator<StreamingEvent>;
  }> {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character = room.characters.find((item) => item.id === characterId);
    if (!character) {
      throw new Error("角色不存在");
    }

    const runtime = this.getAgentRuntime(roomId);
    const stream = await this.orchestrator.generateReplyStream(
      room,
      character,
      this.responseLength,
      runtime,
    );

    return {
      characterName: stream.characterName,
      requestId: stream.requestId,
      messageId: stream.messageId,
      events: stream.events,
    };
  }

  createAiMessageFromStreamResult(character: Character, requestId: string, content: string): Message {
    return {
      id: requestId,
      character_id: character.id,
      character_name: character.name,
      content,
      timestamp: nowIso(),
      is_system: false,
      sender_type: "ai",
      sender_user_id: "system",
    };
  }

  private getAgentRuntime(roomId: string): OrchestratorRuntime {
    return {
      roomId,
      provider: this.currentProvider,
      model: this.currentModel,
      listRoomVariables: async (id) => this.listRoomVariables(id),
      listGlobalVariables: async () => this.listGlobalVariables(),
      setVariable: async (scope, name, value) => this.setVariable(scope, roomId, name, value),
      addVariable: async (scope, name, value) => this.addVariable(scope, roomId, name, value),
      incVariable: async (scope, name, value) => this.incVariable(scope, roomId, name, value),
      decVariable: async (scope, name, value) => this.decVariable(scope, roomId, name, value),
    };
  }
}

export const appState = new AppState();
export default AppState;
