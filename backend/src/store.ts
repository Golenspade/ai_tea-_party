import "./load-env.js";

import { randomUUID } from "node:crypto";

import type {
  Character,
  CharacterFormData,
  ChatRoom,
  DmNextSpeaker,
  Message,
  MessagePatch,
  StreamingEvent,
  Persona,
  VariableEntry,
  VariableUpdateOp,
  VariableUpdatePayload,
  WorldInfoBook,
  WorldInfoEntry,
  ProviderDef,
  RoomBarSnapshot,
  PendingAsk,
  AskAnswer,
  RoomArchive,
  RoomArchiveRecord,
  RoomCompactResult,
  RoomSummary,
  BehaviorRule,
  ActiveBranch,
} from "@ai-party/shared";

import { AppRepository } from "./db/repository";
import {
  ChatOrchestrator,
  type OrchestratorRuntime,
} from "./services/orchestrator";
import {
  buildWriteToRoomMessage,
  type WriteToRoomInput,
} from "./services/write-to-room";
import {
  buildRoomBarSnapshot,
  type WriteToBarInput,
} from "./services/write-to-bar";
import {
  buildVariableUpdatePayload,
  isNoOpVariableChange,
} from "./services/variable-events";
import type { PatchRoomInput } from "./services/patch-room";
import {
  entriesToVariableRecord,
  executeVariableCommand,
  renderVariableMacros,
  type VariableOps,
} from "./services/variables";
import { ResponseLength } from "./types";
import { parseEnvAiProvider } from "./services/resolve-pi-model";
import {
  credentialSettingKey,
  createPiGetApiKey,
  hasCredentialForAppProvider,
} from "./services/pi-credentials";
import { bootstrapRoomsFromConfig } from "./utils/config-bootstrap";
import { chooseNextSpeaker as selectNextSpeaker } from "./services/dm-orchestrator";
import {
  buildRoomArchiveSnapshot,
  readRoomArchiveFile,
  writeRoomArchiveFile,
} from "./services/archive-builder";
import {
  createDeterministicRoomSummary,
  selectCompactionRange,
} from "./services/summary-compact";
import {
  evaluateVariableConditions,
  normalizeConditionLogic,
  normalizeVariableConditions,
} from "./services/variable-conditions";

const nowIso = () => new Date().toISOString();

export interface AgentSessionHooks {
  onRoomMessage?: (message: Message) => void | Promise<void>;
  onMessagePatch?: (patch: MessagePatch) => void | Promise<void>;
  onBarUpdate?: (snapshot: RoomBarSnapshot) => void | Promise<void>;
  onAskPending?: (ask: PendingAsk) => void | Promise<void>;
}

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
  private readonly designatedNextSpeakers = new Map<string, string>();
  private readonly orchestrator: ChatOrchestrator;
  private variableChangeNotifier?: (
    payload: VariableUpdatePayload,
  ) => void | Promise<void>;

  responseLength: ResponseLength = "default";
  currentProvider = "openai";
  currentModel = "gpt-4o-mini";
  autoChatTimers = new Map<string, NodeJS.Timeout>();

  setVariableChangeNotifier(
    notifier: (payload: VariableUpdatePayload) => void | Promise<void>,
  ): void {
    this.variableChangeNotifier = notifier;
  }

  private async emitVariableChange(input: {
    roomId: string;
    scope: "room" | "global";
    name: string;
    op: VariableUpdateOp;
    previousValue?: unknown;
    value: unknown;
  }): Promise<void> {
    if (!this.variableChangeNotifier) return;
    if (isNoOpVariableChange(input.previousValue, input.value) && input.op !== "delete") {
      return;
    }
    await this.variableChangeNotifier(buildVariableUpdatePayload(input));
  }

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
      models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
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

    const hasStoredProvider = this.repository.getSetting("provider");
    if (!hasStoredProvider) {
      const fromEnv =
        parseEnvAiProvider(process.env.AI_PROVIDER) ??
        (process.env.MODEL_OVERRIDE
          ? { provider: "deepseek", model: process.env.MODEL_OVERRIDE }
          : null);
      if (fromEnv && AppState.PROVIDERS[fromEnv.provider]) {
        this.currentProvider = fromEnv.provider;
        const candidate = fromEnv.model;
        if (AppState.PROVIDERS[fromEnv.provider].models.includes(candidate)) {
          this.currentModel = candidate;
        } else {
          this.currentModel = AppState.PROVIDERS[fromEnv.provider].default;
        }
      }
    }

    this.seedDefaults();
  }

  private seedDefaults(): void {
    if (this.repository.listRooms().length === 0) {
      this.bootstrapFromConfigFile();
    }

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

  private bootstrapFromConfigFile(): boolean {
    return bootstrapRoomsFromConfig(
      {
        getRoom: (roomId) => this.getRoom(roomId),
        createRoom: (name, description, options) => {
          this.createRoom(name, description, options);
        },
        addCharacterToRoom: (roomId, data) => {
          this.addCharacterToRoom(roomId, data);
        },
      },
      undefined,
      nowIso,
    );
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

  listRoomSummaries(roomId: string): RoomSummary[] {
    if (!this.repository.getRoom(roomId)) {
      return [];
    }
    return this.repository.listRoomSummaries(roomId);
  }

  listRoomArchives(roomId: string): RoomArchiveRecord[] {
    if (!this.repository.getRoom(roomId)) {
      return [];
    }
    return this.repository.listRoomArchives(roomId);
  }

  compactRoom(
    roomId: string,
    options: {
      mode?: "dry_run" | "commit";
      keep_recent?: number;
      target_messages?: number;
    } = {},
  ): RoomCompactResult {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const messages = this.repository.listAllRoomMessages(roomId);
    const selection = selectCompactionRange(messages, {
      keepRecent: options.keep_recent,
      targetMessages: options.target_messages,
      existingSummaries: this.repository.listRoomSummaries(roomId),
    });

    if (!selection.range || selection.messages.length === 0) {
      return {
        room_id: roomId,
        status: "no_op",
        keep_recent: selection.keepRecent,
        reason: selection.reason || "没有可压缩消息",
      };
    }

    const summary = createDeterministicRoomSummary({
      id: randomUUID(),
      roomId,
      messages: selection.messages,
      createdAt: nowIso(),
    });

    if (options.mode !== "commit") {
      return {
        room_id: roomId,
        status: "dry_run",
        keep_recent: selection.keepRecent,
        range: selection.range,
        summary,
      };
    }

    const saved = this.repository.saveRoomSummary(summary);
    return {
      room_id: roomId,
      status: "committed",
      keep_recent: selection.keepRecent,
      range: selection.range,
      summary: saved,
    };
  }

  createRoomArchive(roomId: string, title?: string): RoomArchiveRecord {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const archiveId = randomUUID();
    const createdAt = nowIso();
    const messages = this.repository.listAllRoomMessages(roomId);
    const roomSnapshot: ChatRoom = {
      ...room,
      messages,
    };
    const archive = buildRoomArchiveSnapshot({
      archiveId,
      title: title?.trim() || `${room.name} Archive ${createdAt}`,
      createdAt,
      room: roomSnapshot,
      messages,
      summaries: this.repository.listRoomSummaries(roomId),
      roomVariables: this.repository.listRoomVariables(roomId),
      globalVariables: this.repository.listGlobalVariables(),
      roomBar: this.repository.getRoomBar(roomId),
      worldInfoBooks: this.repository.getRoomWorldInfo(roomId),
      behaviorRules: this.repository.listBehaviorRules(roomId),
    });

    const filePath = writeRoomArchiveFile(archive);
    const record: RoomArchiveRecord = {
      id: archive.manifest.archive_id,
      room_id: archive.manifest.room_id,
      title: archive.manifest.title,
      manifest: archive.manifest,
      file_path: filePath,
      created_at: archive.manifest.created_at,
    };

    return this.repository.saveRoomArchive(record);
  }

  getRoomArchive(roomId: string, archiveId: string): RoomArchive | undefined {
    const record = this.repository.getRoomArchive(archiveId);
    if (!record || record.room_id !== roomId) {
      return undefined;
    }
    return readRoomArchiveFile(record);
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
      const previousValue = this.repository.getGlobalVariable(key);
      const result = this.repository.setGlobalVariable(key, value);
      void this.emitVariableChange({
        roomId: roomIdOrName,
        scope: "global",
        name: key,
        op: "set",
        previousValue,
        value: result.value,
      });
      return result;
    }

    if (!this.repository.getRoom(roomIdOrName)) {
      throw new Error("聊天室不存在");
    }
    const previousValue = this.repository.getRoomVariable(roomIdOrName, key);
    const result = this.repository.setRoomVariable(roomIdOrName, key, value);
    void this.emitVariableChange({
      roomId: roomIdOrName,
      scope: "room",
      name: key,
      op: "set",
      previousValue,
      value: result.value,
    });
    return result;
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
      const previousValue = this.repository.getGlobalVariable(key);
      const deleted = this.repository.deleteGlobalVariable(key);
      if (deleted) {
        void this.emitVariableChange({
          roomId: roomIdOrName,
          scope: "global",
          name: key,
          op: "delete",
          previousValue,
          value: undefined,
        });
      }
      return deleted;
    }

    const room = this.getRoom(roomIdOrName);
    if (!room) {
      return false;
    }
    const previousValue = this.repository.getRoomVariable(room.id, key);
    const deleted = this.repository.deleteRoomVariable(room.id, key);
    if (deleted) {
      void this.emitVariableChange({
        roomId: room.id,
        scope: "room",
        name: key,
        op: "delete",
        previousValue,
        value: undefined,
      });
    }
    return deleted;
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
    const previousValue =
      ctx.scope === "global"
        ? this.repository.getGlobalVariable(key)
        : this.repository.getRoomVariable(ctx.roomId!, key);

    let result: VariableEntry;
    if (mode === "add") {
      if (ctx.scope === "global") {
        result = this.repository.addGlobalVariable(key, value);
      } else {
        if (!ctx.roomId) {
          throw new Error("聊天室不存在");
        }
        result = this.repository.addRoomVariable(ctx.roomId, key, value);
      }
    } else if (ctx.scope === "global") {
      result =
        mode === "inc"
          ? this.repository.incGlobalVariable(key, value)
          : this.repository.decGlobalVariable(key, value);
    } else {
      if (!ctx.roomId) {
        throw new Error("聊天室不存在");
      }
      result =
        mode === "inc"
          ? this.repository.incRoomVariable(ctx.roomId, key, value)
          : this.repository.decRoomVariable(ctx.roomId, key, value);
    }

    void this.emitVariableChange({
      roomId: ctx.roomId ?? roomIdOrName,
      scope: ctx.scope,
      name: key,
      op: mode,
      previousValue,
      value: result.value,
    });
    return result;
  }

  addCharacterToRoom(roomId: string, data: Character | CharacterFormData): Character {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character: Character = {
      id: "id" in data && data.id ? data.id : randomUUID(),
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

  designateNextSpeaker(roomId: string, characterId: string): DmNextSpeaker {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character = room.characters.find(
      (item) => item.id === characterId && item.is_active !== false,
    );
    if (!character) {
      throw new Error("角色不存在或不可用");
    }

    this.designatedNextSpeakers.set(roomId, character.id);
    return {
      room_id: roomId,
      character_id: character.id,
      character_name: character.name,
      selected_at: nowIso(),
      source: "user",
      reason: "用户指定下轮发言者",
    };
  }

  chooseNextSpeaker(roomId: string): DmNextSpeaker | undefined {
    const room = this.getRoom(roomId);
    if (!room) {
      return undefined;
    }

    const pendingCharacterId = this.designatedNextSpeakers.get(roomId);
    const choice = selectNextSpeaker(room, pendingCharacterId);
    if (!choice) {
      this.designatedNextSpeakers.delete(roomId);
      return undefined;
    }

    if (pendingCharacterId) {
      this.designatedNextSpeakers.delete(roomId);
    }

    return {
      room_id: roomId,
      character_id: choice.character.id,
      character_name: choice.character.name,
      selected_at: nowIso(),
      source: choice.source,
      reason: choice.reason,
    };
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
      conditions: normalizeVariableConditions(entry.conditions),
      condition_logic: normalizeConditionLogic(entry.condition_logic),
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

  listBehaviorRules(roomId: string): BehaviorRule[] {
    if (!this.repository.getRoom(roomId)) {
      return [];
    }
    return this.repository.listBehaviorRules(roomId);
  }

  upsertBehaviorRule(
    roomId: string,
    rule: Partial<BehaviorRule> & {
      name: string;
      prompt_text: string;
    },
  ): BehaviorRule {
    if (!this.repository.getRoom(roomId)) {
      throw new Error("聊天室不存在");
    }

    const createdAt = rule.created_at || nowIso();
    const normalized: BehaviorRule = {
      id: rule.id || randomUUID(),
      room_id: roomId,
      name: rule.name.trim(),
      enabled: rule.enabled !== false,
      priority: Number.isFinite(rule.priority) ? Math.floor(rule.priority || 0) : 100,
      conditions: normalizeVariableConditions(rule.conditions),
      condition_logic: normalizeConditionLogic(rule.condition_logic),
      prompt_text: rule.prompt_text || "",
      created_at: createdAt,
      updated_at: nowIso(),
    };

    return this.repository.upsertBehaviorRule(normalized);
  }

  deleteBehaviorRule(roomId: string, ruleId: string): boolean {
    return this.repository.deleteBehaviorRule(roomId, ruleId);
  }

  listActiveBranches(roomId: string): ActiveBranch[] {
    if (!this.repository.getRoom(roomId)) {
      return [];
    }

    const variableContext = {
      room: entriesToVariableRecord(this.listRoomVariables(roomId)),
      global: entriesToVariableRecord(this.listGlobalVariables()),
    };
    const branches: ActiveBranch[] = [];

    for (const book of this.getRoomWorldInfo(roomId)) {
      if (!book.enabled) {
        continue;
      }

      for (const entry of book.entries) {
        if (!entry.enabled || (entry.conditions || []).length === 0) {
          continue;
        }

        if (
          evaluateVariableConditions(
            entry.conditions,
            entry.condition_logic,
            variableContext,
          )
        ) {
          branches.push({
            id: entry.id,
            type: "world_info",
            name: entry.keys[0] || "WorldInfo 条目",
            source: book.name,
            content: entry.content,
            priority: entry.order,
          });
        }
      }
    }

    for (const rule of this.listBehaviorRules(roomId)) {
      if (!rule.enabled) {
        continue;
      }

      if (
        evaluateVariableConditions(
          rule.conditions,
          rule.condition_logic,
          variableContext,
        )
      ) {
        branches.push({
          id: rule.id,
          type: "behavior_rule",
          name: rule.name,
          source: "行为书",
          content: rule.prompt_text,
          priority: rule.priority,
        });
      }
    }

    return branches.sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));
  }

  getProviderDefs(): Record<string, ProviderDef> {
    return { ...AppState.PROVIDERS };
  }

  getConfig() {
    return {
      provider: this.currentProvider,
      model: this.currentModel,
      has_api_key: hasCredentialForAppProvider(
        this.currentProvider,
        (provider) => this.getStoredApiKey(provider),
      ),
    };
  }

  getStoredApiKey(provider: string): string | undefined {
    const value = this.repository.getSetting(credentialSettingKey(provider, "api_key"));
    return value || undefined;
  }

  getStoredApiBase(provider: string): string | undefined {
    const value = this.repository.getSetting(credentialSettingKey(provider, "api_base"));
    return value || undefined;
  }

  setConfig(payload: {
    provider: string;
    model?: string;
    api_key?: string;
    api_base?: string;
  }): void {
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

    const trimmedKey = payload.api_key?.trim();
    if (trimmedKey) {
      this.repository.setSetting(credentialSettingKey(payload.provider, "api_key"), trimmedKey);
    }

    const trimmedBase = payload.api_base?.trim();
    if (trimmedBase) {
      this.repository.setSetting(credentialSettingKey(payload.provider, "api_base"), trimmedBase);
    }
  }

  setResponseLength(next: ResponseLength): void {
    this.responseLength = next;
    this.repository.setSetting("response_length", next);
  }

  testConnection() {
    if (!AppState.PROVIDERS[this.currentProvider]) {
      return { success: false, message: "provider not found" };
    }

    if (
      !hasCredentialForAppProvider(this.currentProvider, (provider) =>
        this.getStoredApiKey(provider),
      )
    ) {
      const envKey = AppState.PROVIDERS[this.currentProvider].env_key;
      return {
        success: false,
        message: `未配置 ${this.currentProvider} 的 API 密钥（前端设置或 ${envKey}）`,
      };
    }

    return {
      success: true,
      message: `${this.currentModel} 凭证已就绪`,
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

  async generateAiReply(
    roomId: string,
    characterId: string,
    hooks?: AgentSessionHooks,
  ): Promise<{ message: Message | null; requestId: string }> {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character = room.characters.find((item) => item.id === characterId);
    if (!character) {
      throw new Error("角色不存在");
    }

    const runtime = this.getAgentRuntime(roomId, character, hooks);
    const reply = await this.orchestrator.generateReply(room, character, this.responseLength, runtime);

    if (!reply.content.trim()) {
      return { message: null, requestId: reply.requestId };
    }

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

  writeAgentRoomMessage(roomId: string, speakingCharacter: Character, input: WriteToRoomInput): Message {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const message = buildWriteToRoomMessage(input, {
      roomId,
      speakingCharacter,
      characters: room.characters,
      now: nowIso,
    });
    this.addRoomMessage(roomId, message);
    return message;
  }

  patchAgentRoomMessage(roomId: string, input: PatchRoomInput): MessagePatch {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const existing = this.repository.getRoomMessage(roomId, input.message_id);
    if (!existing) {
      throw new Error("消息不存在");
    }

    if (existing.sender_type === "user") {
      throw new Error("不能修改用户消息");
    }

    const updated = this.repository.updateRoomMessageContent(roomId, input.message_id, input.content);
    if (!updated) {
      throw new Error("消息不存在");
    }

    return {
      room_id: roomId,
      message_id: updated.id,
      content: updated.content,
      patched_at: nowIso(),
      reason: input.reason,
    };
  }

  getRoomBar(roomId: string): RoomBarSnapshot | null {
    return this.repository.getRoomBar(roomId);
  }

  writeAgentBar(roomId: string, input: WriteToBarInput): RoomBarSnapshot {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const previous = this.repository.getRoomBar(roomId);
    const snapshot = buildRoomBarSnapshot(roomId, input, previous?.version ?? 0, nowIso);
    return this.repository.upsertRoomBar(snapshot);
  }

  getRoomPendingAsk(roomId: string): PendingAsk | undefined {
    return this.repository.getRoomPendingAsk(roomId);
  }

  answerPendingAsk(askId: string, answer: AskAnswer): PendingAsk | undefined {
    return this.repository.resolvePendingAsk(askId, answer, nowIso());
  }

  getPendingAsk(askId: string): PendingAsk | undefined {
    return this.repository.getPendingAsk(askId);
  }

  async startAiResumeStream(
    roomId: string,
    askId: string,
    hooks?: AgentSessionHooks,
  ): Promise<{
    characterName: string;
    requestId: string;
    messageId: string;
    events: AsyncGenerator<StreamingEvent>;
  }> {
    const pending = this.getPendingAsk(askId);
    if (!pending || pending.status !== "resolved" || !pending.answer) {
      throw new Error("Ask 不存在或尚未回答");
    }

    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("聊天室不存在");
    }

    const character = room.characters.find((item) => item.id === pending.character_id);
    if (!character) {
      throw new Error("角色不存在");
    }

    const runtime = this.getAgentRuntime(roomId, character, hooks);
    const stream = await this.orchestrator.generateResumeStream(
      room,
      character,
      pending,
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

  createPendingAskForAgent(
    roomId: string,
    speakingCharacter: Character,
    input: {
      requestId: string;
      toolCallId: string;
      question: string;
      choices: string[];
      allowCustom: boolean;
      multiple: boolean;
      agentMessagesJson: string;
      systemPrompt: string;
    },
  ): PendingAsk {
    return this.repository.createPendingAsk({
      id: randomUUID(),
      roomId,
      requestId: input.requestId,
      characterId: speakingCharacter.id,
      toolCallId: input.toolCallId,
      question: input.question,
      choices: input.choices,
      allowCustom: input.allowCustom,
      multiple: input.multiple,
      agentMessagesJson: input.agentMessagesJson,
      systemPrompt: input.systemPrompt,
      provider: this.currentProvider,
      model: this.currentModel,
      createdAt: nowIso(),
    });
  }

  async startAiReplyStream(
    roomId: string,
    characterId: string,
    hooks?: AgentSessionHooks,
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

    const runtime = this.getAgentRuntime(roomId, character, hooks);
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

  buildOutgoingMessages(
    roomId: string,
    characterId: string,
    characterName: string,
    content: string,
    meta: {
      sender_type?: Message["sender_type"];
      sender_user_id?: string;
      sender_user_name?: string;
    } = {},
  ): Message[] {
    const ops = this.createVariableOps(roomId);
    const commandResult = executeVariableCommand(content, ops);

    if (commandResult.handled) {
      if (!commandResult.output) {
        return [];
      }

      return [
        {
          id: randomUUID(),
          character_id: "system",
          character_name: "系统",
          content: commandResult.output,
          timestamp: nowIso(),
          is_system: true,
          sender_type: "system",
        },
      ];
    }

    const renderedContent = renderVariableMacros(content, ops);

    return [
      {
        id: randomUUID(),
        character_id: characterId,
        character_name: characterName,
        content: renderedContent,
        timestamp: nowIso(),
        is_system: false,
        sender_type: meta.sender_type || "user",
        sender_user_id: meta.sender_user_id || "user",
        sender_user_name: meta.sender_user_name,
      },
    ];
  }

  private createVariableOps(roomId: string): VariableOps {
    return {
      roomId,
      listRoomVariables: () => entriesToVariableRecord(this.listRoomVariables(roomId)),
      listGlobalVariables: () => entriesToVariableRecord(this.listGlobalVariables()),
      getRoomVariable: (name) => this.repository.getRoomVariable(roomId, name),
      getGlobalVariable: (name) => this.repository.getGlobalVariable(name),
      roomVariableExists: (name) => this.repository.getRoomVariable(roomId, name) !== undefined,
      globalVariableExists: (name) => this.repository.getGlobalVariable(name) !== undefined,
      setRoomVariable: (name, value) => {
        this.setVariable("room", roomId, name, value);
      },
      setGlobalVariable: (name, value) => {
        this.setVariable("global", "global", name, value);
      },
      addRoomVariable: (name, value) => this.addVariable("room", roomId, name, value).value,
      addGlobalVariable: (name, value) => this.addVariable("global", "global", name, value).value,
      incRoomVariable: (name, value) => this.incVariable("room", roomId, name, value).value,
      incGlobalVariable: (name, value) => this.incVariable("global", "global", name, value).value,
      decRoomVariable: (name, value) => this.decVariable("room", roomId, name, value).value,
      decGlobalVariable: (name, value) => this.decVariable("global", "global", name, value).value,
      deleteRoomVariable: (name) => {
        this.deleteVariable("room", roomId, name);
      },
      deleteGlobalVariable: (name) => {
        this.deleteVariable("global", "global", name);
      },
    };
  }

  private getAgentRuntime(
    roomId: string,
    speakingCharacter: Character,
    hooks?: AgentSessionHooks,
  ): OrchestratorRuntime {
    const room = this.getRoom(roomId);

    return {
      roomId,
      provider: this.currentProvider,
      model: this.currentModel,
      getApiKey: createPiGetApiKey({
        getStoredApiKey: (provider) => this.getStoredApiKey(provider),
      }),
      speakingCharacterId: speakingCharacter.id,
      speakingCharacterName: speakingCharacter.name,
      listRoomCharacters: () => room?.characters ?? [],
      writeToRoom: async (input) => {
        const message = this.writeAgentRoomMessage(roomId, speakingCharacter, input);
        await hooks?.onRoomMessage?.(message);
        return message;
      },
      patchRoom: async (input) => {
        const patch = this.patchAgentRoomMessage(roomId, input);
        await hooks?.onMessagePatch?.(patch);
        return patch;
      },
      writeToBar: async (input) => {
        const snapshot = this.writeAgentBar(roomId, input);
        await hooks?.onBarUpdate?.(snapshot);
        return snapshot;
      },
      createPendingAsk: async (input) => {
        const pending = this.createPendingAskForAgent(roomId, speakingCharacter, input);
        await hooks?.onAskPending?.(pending);
        return pending;
      },
      listRoomVariables: async (id) => this.listRoomVariables(id),
      listGlobalVariables: async () => this.listGlobalVariables(),
      setVariable: async (scope, name, value) => this.setVariable(scope, roomId, name, value),
      addVariable: async (scope, name, value) => this.addVariable(scope, roomId, name, value),
      incVariable: async (scope, name, value) => this.incVariable(scope, roomId, name, value),
      decVariable: async (scope, name, value) => this.decVariable(scope, roomId, name, value),
      listRoomWorldInfoBooks: async (id) => this.getRoomWorldInfo(id),
      listRoomSummaries: async (id) => this.listRoomSummaries(id),
      listBehaviorRules: async (id) => this.listBehaviorRules(id),
      getDefaultPersona: () => this.listPersonas().find((persona) => persona.is_default) ?? null,
    };
  }
}

export const appState = new AppState();
export default AppState;
