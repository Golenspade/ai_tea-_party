import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type {
  Character,
  ChatRoom,
  Message,
  Persona,
  VariableEntry,
  WorldInfoBook,
  WorldInfoEntry,
  RoomBarSnapshot,
  PendingAsk,
  AskAnswer,
  RoomArchiveManifest,
  RoomArchiveRecord,
  RoomSummary,
  BehaviorRule,
} from "@ai-party/shared";
import {
  normalizeConditionLogic,
  normalizeVariableConditions,
} from "../services/variable-conditions";
import { createDatabase, ensureSchema } from "./client";
import {
  characters,
  exampleDialogues,
  globalVariables,
  messages,
  personas,
  roomCharacters,
  roomVariables,
  settings,
  roomWorldInfo,
  rooms,
  worldInfoBooks,
  worldInfoEntries,
  roomBar,
  pendingAsks,
  roomArchives,
  roomSummaries,
  behaviorRules,
} from "./schema";

const toJson = (value: unknown): string => {
  if (value === undefined) {
    return "null";
  }
  return JSON.stringify(value, null, 0) ?? "null";
};

const parseJson = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const normalizePosition = (value: string): WorldInfoEntry["position"] => {
  switch (value) {
    case "before_char":
      return "before_char";
    case "after_char":
      return "after_char";
    case "before_examples":
      return "before_examples";
    case "after_examples":
      return "after_examples";
    case "at_depth":
      return "at_depth";
    case "system_top":
      return "system_top";
    case "system_bottom":
      return "system_bottom";
    default:
      return "after_char";
  }
};

const nowIso = () => new Date().toISOString();

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const applyAddValue = (
  current: unknown,
  value: unknown,
): { changed: boolean; next: unknown } => {
  if (current === undefined || current === null) {
    return { changed: true, next: value };
  }

  if (Array.isArray(current)) {
    return {
      changed: true,
      next: [...current, ...(Array.isArray(value) ? value : [value])],
    };
  }

  if (
    typeof current === "number"
    && Number.isFinite(current)
    && typeof value === "number"
    && Number.isFinite(value)
  ) {
    return { changed: true, next: current + value };
  }

  if (typeof current === "string" && typeof value === "string") {
    return { changed: true, next: current + value };
  }

  return { changed: false, next: current };
};

const applyIncDec = (
  current: unknown,
  value: unknown,
  sign: 1 | -1,
): { changed: boolean; next: unknown } => {
  const delta = asNumber(value);
  if (delta === undefined) {
    return { changed: false, next: current };
  }

  if (current === undefined || current === null) {
    return { changed: true, next: delta * sign };
  }

  if (typeof current === "number" && Number.isFinite(current)) {
    return { changed: true, next: current + sign * delta };
  }

  return { changed: false, next: current };
};

const toBool = (raw: boolean | number | null | undefined): boolean => {
  if (raw === undefined || raw === null) {
    return false;
  }
  return Number(raw) === 1 || raw === true;
};

export class AppRepository {
  private readonly db: BetterSQLite3Database<typeof import("./schema")>;

  constructor() {
    const { db, client } = createDatabase();
    this.db = db;
    ensureSchema(client);
  }

  listRooms(): ChatRoom[] {
    const rows = this.db.select().from(rooms).all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || "",
      characters: this.getRoomCharacters(row.id),
      messages: this.getRoomMessages(row.id, undefined, row.maxHistory),
      is_auto_chat: false,
      max_history: row.maxHistory,
      created_at: row.createdAt,
      stealth_mode: toBool(row.stealthMode),
      user_description: row.userDescription || "",
    }));
  }

  getRoom(roomId: string): ChatRoom | undefined {
    const row = this.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .get();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      characters: this.getRoomCharacters(row.id),
      messages: this.getRoomMessages(row.id, undefined, row.maxHistory),
      is_auto_chat: false,
      max_history: row.maxHistory,
      created_at: row.createdAt,
      stealth_mode: toBool(row.stealthMode),
      user_description: row.userDescription || "",
    };
  }

  createRoom(roomId: string, name: string, description = "", options?: Partial<ChatRoom>): ChatRoom {
    const createdAt = options?.created_at || nowIso();
    const row = {
      id: roomId,
      name,
      description,
      stealthMode: Boolean(options?.stealth_mode ?? false),
      userDescription: options?.user_description || "",
      personaId: undefined,
      createdAt,
      maxHistory: 50,
    };

    const normalizedMaxHistory = asNumber(options?.max_history);
    if (normalizedMaxHistory !== undefined && normalizedMaxHistory > 0) {
      row.maxHistory = Math.floor(normalizedMaxHistory);
    }

    this.db
      .insert(rooms)
      .values(row)
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          name: row.name,
          description: row.description,
          stealthMode: row.stealthMode,
          userDescription: row.userDescription,
          maxHistory: row.maxHistory,
        },
      })
      .run();

    return {
      ...this.getRoom(roomId)!,
    };
  }

  setRoomMeta(
    roomId: string,
    updates: Partial<{
      stealth_mode: boolean;
      user_description: string;
      name: string;
      description: string;
      max_history: number;
    }>,
  ): ChatRoom | undefined {
    const row = this.getRoom(roomId);
    if (!row) {
      return undefined;
    }

    const set: Partial<
      typeof rooms.$inferInsert
    > = {};

    if (updates.stealth_mode !== undefined) {
      set.stealthMode = Boolean(updates.stealth_mode);
    }

    if (updates.user_description !== undefined) {
      set.userDescription = updates.user_description;
    }

    if (updates.name !== undefined) {
      set.name = updates.name;
    }

    if (updates.description !== undefined) {
      set.description = updates.description;
    }

    if (updates.max_history !== undefined) {
      const normalizedMax = asNumber(updates.max_history);
      if (normalizedMax !== undefined && normalizedMax > 0) {
        set.maxHistory = Math.floor(normalizedMax);
      }
    }

    if (Object.keys(set).length > 0) {
      this.db.update(rooms).set(set).where(eq(rooms.id, roomId)).run();
    }
    return this.getRoom(roomId) || undefined;
  }

  getRoomCharacters(roomId: string): Character[] {
    const relations = this.db
      .select()
      .from(roomCharacters)
      .where(eq(roomCharacters.roomId, roomId))
      .all()
      .map((item) => item.characterId);

    if (relations.length === 0) {
      return [];
    }

    const rows = this.db
      .select()
      .from(characters)
      .where(inArray(characters.id, relations))
      .all();

    const examplesByCharacter = this.loadExampleDialogues(relations);
    const indexMap = new Map(rows.map((item) => [item.id, item]));
    const ordered: Character[] = [];

    for (const charId of relations) {
      const item = indexMap.get(charId);
      if (!item) {
        continue;
      }

      ordered.push({
        id: item.id,
        name: item.name,
        personality: item.personality,
        background: item.background,
        description: item.description || "",
        scenario: item.scenario || "",
        speaking_style: item.speakingStyle || "",
        system_prompt_override: item.systemPromptOverride || "",
        post_instructions: item.postInstructions || "",
        greeting: item.greeting || "",
        creator_notes: item.creatorNotes || "",
        tags: parseJson(item.tags) as string[] | undefined || [],
        is_active: toBool(item.isActive),
        example_dialogues: examplesByCharacter[item.id] || [],
      });
    }

    return ordered;
  }

  loadExampleDialogues(characterIds: string[]): Record<string, Character["example_dialogues"]> {
    const result: Record<string, Character["example_dialogues"]> = {};
    if (characterIds.length === 0) {
      return result;
    }

    const rows = this.db
      .select()
      .from(exampleDialogues)
      .where(inArray(exampleDialogues.characterId, characterIds))
      .orderBy(asc(exampleDialogues.sortOrder))
      .all();

    for (const row of rows) {
      const bucket = result[row.characterId] ?? [];
      bucket.push({
        user_message: row.userMessage,
        character_response: row.characterResponse,
      });
      result[row.characterId] = bucket;
    }

    return result;
  }

  getRoomMessages(roomId: string, sinceIso?: string, limit = 50): Message[] {
    const whereClause = sinceIso
      ? and(eq(messages.roomId, roomId), gt(messages.timestamp, sinceIso))
      : eq(messages.roomId, roomId);

    const rows = sinceIso
      ? this.db
          .select()
          .from(messages)
          .where(whereClause)
          .orderBy(asc(messages.timestamp))
          .limit(limit)
          .all()
      : this.db
          .select()
          .from(messages)
          .where(whereClause)
          .orderBy(desc(messages.timestamp))
          .limit(limit)
          .all()
          .reverse();

    return rows.map((item) => ({
      id: item.id,
      character_id: item.characterId,
      character_name: item.characterName,
      content: item.content,
      timestamp: item.timestamp,
      is_system: toBool(item.isSystem),
      sender_type: item.senderType as Message["sender_type"],
      sender_user_id: item.senderUserId || undefined,
      sender_user_name: item.senderUserName || undefined,
    }));
  }

  listAllRoomMessages(roomId: string): Message[] {
    const rows = this.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(asc(messages.timestamp))
      .all();

    return rows.map((item) => ({
      id: item.id,
      character_id: item.characterId,
      character_name: item.characterName,
      content: item.content,
      timestamp: item.timestamp,
      is_system: toBool(item.isSystem),
      sender_type: item.senderType as Message["sender_type"],
      sender_user_id: item.senderUserId || undefined,
      sender_user_name: item.senderUserName || undefined,
    }));
  }

  getRoomMessage(roomId: string, messageId: string): Message | undefined {
    const row = this.db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, roomId), eq(messages.id, messageId)))
      .get();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      character_id: row.characterId,
      character_name: row.characterName,
      content: row.content,
      timestamp: row.timestamp,
      is_system: toBool(row.isSystem),
      sender_type: row.senderType as Message["sender_type"],
      sender_user_id: row.senderUserId || undefined,
      sender_user_name: row.senderUserName || undefined,
    };
  }

  addRoomMessage(roomId: string, message: Message): Message {
    const values = {
      id: message.id,
      roomId,
      characterId: message.character_id,
      characterName: message.character_name,
      content: message.content,
      isSystem: Boolean(message.is_system),
      timestamp: message.timestamp || nowIso(),
      senderType: message.sender_type || null,
      senderUserId: message.sender_user_id || null,
      senderUserName: message.sender_user_name || null,
    } as const;

    this.db
      .insert(messages)
      .values(values)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          roomId,
          characterId: values.characterId,
          characterName: values.characterName,
          content: values.content,
          isSystem: values.isSystem,
          timestamp: values.timestamp,
          senderType: values.senderType,
          senderUserId: values.senderUserId,
          senderUserName: values.senderUserName,
        },
      })
      .run();

    return message;
  }

  updateRoomMessageContent(roomId: string, messageId: string, content: string): Message | undefined {
    const existing = this.getRoomMessage(roomId, messageId);
    if (!existing) {
      return undefined;
    }

    this.db
      .update(messages)
      .set({ content })
      .where(and(eq(messages.roomId, roomId), eq(messages.id, messageId)))
      .run();

    return {
      ...existing,
      content,
    };
  }

  clearRoomMessages(roomId: string): void {
    this.db.delete(messages).where(eq(messages.roomId, roomId)).run();
  }

  ensureMessageLimit(roomId: string): void {
    const room = this.getRoom(roomId);
    if (!room) return;
    const limit = room.max_history || 50;

    const row = this.db
      .select({ total: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .get();

    const total = Number(row?.total || 0);
    const overflow = total - limit;
    if (overflow <= 0) return;

    const overflowRows = this.db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(asc(messages.timestamp))
      .limit(overflow)
      .all()
      .map((item) => item.id);

    if (overflowRows.length > 0) {
      this.db.delete(messages).where(inArray(messages.id, overflowRows)).run();
    }
  }

  addCharacterToRoom(roomId: string, character: Character): Character {
    this.db
      .insert(characters)
      .values({
        id: character.id,
        name: character.name,
        personality: character.personality,
        background: character.background,
        description: character.description || "",
        scenario: character.scenario || "",
        speakingStyle: character.speaking_style || "",
        systemPromptOverride: character.system_prompt_override || "",
        postInstructions: character.post_instructions || "",
        greeting: character.greeting || "",
        creatorNotes: character.creator_notes || "",
        tags: toJson(character.tags || []),
        isActive: Boolean(character.is_active),
        avatar: character.avatar || null,
      })
      .onConflictDoUpdate({
        target: characters.id,
        set: {
          name: character.name,
          personality: character.personality,
          background: character.background,
          description: character.description || "",
          scenario: character.scenario || "",
          speakingStyle: character.speaking_style || "",
          systemPromptOverride: character.system_prompt_override || "",
          postInstructions: character.post_instructions || "",
          greeting: character.greeting || "",
          creatorNotes: character.creator_notes || "",
          tags: toJson(character.tags || []),
          isActive: Boolean(character.is_active),
          avatar: character.avatar || null,
        },
      })
      .run();

    this.db
      .insert(roomCharacters)
      .values({ roomId, characterId: character.id })
      .onConflictDoNothing()
      .run();

    this.db
      .delete(exampleDialogues)
      .where(eq(exampleDialogues.characterId, character.id))
      .run();

    if (character.example_dialogues?.length) {
      character.example_dialogues.forEach((entry, index) => {
        this.db
          .insert(exampleDialogues)
          .values({
            id: `${character.id}-${index}-${nowIso()}`,
            characterId: character.id,
            userMessage: entry.user_message,
            characterResponse: entry.character_response,
            sortOrder: index,
          })
          .run();
      });
    }

    return { ...character, is_active: toBool(character.is_active) };
  }

  removeCharacterFromRoom(roomId: string, characterId: string): Character | undefined {
    const room = this.getRoom(roomId);
    if (!room) {
      return undefined;
    }

    const existing = room.characters.find((item) => item.id === characterId);
    if (!existing) return undefined;

    this.db
      .delete(roomCharacters)
      .where(and(eq(roomCharacters.roomId, roomId), eq(roomCharacters.characterId, characterId)))
      .run();

    return existing;
  }

  listGlobalVariables(): VariableEntry[] {
    const rows = this.db.select().from(globalVariables).all();
    return rows.map((item) => ({
      name: item.name,
      value: parseJson(item.valueJson),
      scope: "global",
    }));
  }

  getGlobalVariable(name: string): unknown | undefined {
    const row = this.db
      .select()
      .from(globalVariables)
      .where(eq(globalVariables.name, name))
      .get();
    if (!row) return undefined;
    return parseJson(row.valueJson);
  }

  setGlobalVariable(name: string, value: unknown): VariableEntry {
    const normalized = toJson(value);
    this.db
      .insert(globalVariables)
      .values({
        name,
        valueJson: normalized,
        updatedAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: globalVariables.name,
        set: {
          valueJson: normalized,
          updatedAt: nowIso(),
        },
      })
      .run();

    return { name, value, scope: "global" };
  }

  addGlobalVariable(name: string, value: unknown): VariableEntry {
    const current = this.getGlobalVariable(name);
    const result = applyAddValue(current, value);
    if (!result.changed) {
      return { name, value: result.next, scope: "global" };
    }
    return this.setGlobalVariable(name, result.next);
  }

  incGlobalVariable(name: string, value: unknown): VariableEntry {
    const current = this.getGlobalVariable(name);
    const result = applyIncDec(current, value, 1);
    if (!result.changed) {
      return { name, value: result.next, scope: "global" };
    }
    return this.setGlobalVariable(name, result.next);
  }

  decGlobalVariable(name: string, value: unknown): VariableEntry {
    const current = this.getGlobalVariable(name);
    const result = applyIncDec(current, value, -1);
    if (!result.changed) {
      return { name, value: result.next, scope: "global" };
    }
    return this.setGlobalVariable(name, result.next);
  }

  deleteGlobalVariable(name: string): boolean {
    const result = this.db.delete(globalVariables).where(eq(globalVariables.name, name)).run();
    return result.changes > 0;
  }

  listRoomVariables(roomId: string): VariableEntry[] {
    const rows = this.db
      .select()
      .from(roomVariables)
      .where(eq(roomVariables.roomId, roomId))
      .all();

    return rows.map((item) => ({
      name: item.name,
      value: parseJson(item.valueJson),
      scope: "room",
    }));
  }

  getRoomVariable(roomId: string, name: string): unknown | undefined {
    const row = this.db
      .select()
      .from(roomVariables)
      .where(and(eq(roomVariables.roomId, roomId), eq(roomVariables.name, name)))
      .get();
    if (!row) return undefined;
    return parseJson(row.valueJson);
  }

  setRoomVariable(roomId: string, name: string, value: unknown): VariableEntry {
    const normalized = toJson(value);
    this.db
      .insert(roomVariables)
      .values({
        roomId,
        scope: "room",
        name,
        valueJson: normalized,
        updatedAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: [roomVariables.roomId, roomVariables.scope, roomVariables.name],
        set: {
          valueJson: normalized,
          updatedAt: nowIso(),
        },
      })
      .run();

    return { name, value, scope: "room" };
  }

  addRoomVariable(roomId: string, name: string, value: unknown): VariableEntry {
    const current = this.getRoomVariable(roomId, name);
    const result = applyAddValue(current, value);
    if (!result.changed) {
      return { name, value: result.next, scope: "room" };
    }
    return this.setRoomVariable(roomId, name, result.next);
  }

  incRoomVariable(roomId: string, name: string, value: unknown): VariableEntry {
    const current = this.getRoomVariable(roomId, name);
    const result = applyIncDec(current, value, 1);
    if (!result.changed) {
      return { name, value: result.next, scope: "room" };
    }
    return this.setRoomVariable(roomId, name, result.next);
  }

  decRoomVariable(roomId: string, name: string, value: unknown): VariableEntry {
    const current = this.getRoomVariable(roomId, name);
    const result = applyIncDec(current, value, -1);
    if (!result.changed) {
      return { name, value: result.next, scope: "room" };
    }
    return this.setRoomVariable(roomId, name, result.next);
  }

  deleteRoomVariable(roomId: string, name: string): boolean {
    const result = this.db
      .delete(roomVariables)
      .where(and(eq(roomVariables.roomId, roomId), eq(roomVariables.name, name)))
      .run();
    return result.changes > 0;
  }

  listPersonas(): Persona[] {
    const rows = this.db.select().from(personas).all();
    return rows.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || "",
      is_default: toBool(item.isDefault),
    }));
  }

  savePersona(persona: Persona): Persona {
    this.db
      .insert(personas)
      .values({
        id: persona.id,
        name: persona.name,
        description: persona.description,
        isDefault: Boolean(persona.is_default),
      })
      .onConflictDoUpdate({
        target: personas.id,
        set: {
          name: persona.name,
          description: persona.description,
          isDefault: Boolean(persona.is_default),
        },
      })
      .run();

    return persona;
  }

  deletePersona(personaId: string): void {
    this.db.delete(personas).where(eq(personas.id, personaId)).run();
  }

  listWorldInfoBooks(): WorldInfoBook[] {
    const rows = this.db.select().from(worldInfoBooks).all();
    const entryRows = this.db
      .select()
      .from(worldInfoEntries)
      .orderBy(asc(worldInfoEntries.sortOrder))
      .all();

    const grouped = new Map<string, WorldInfoEntry[]>();
    for (const row of entryRows) {
      const list = grouped.get(row.bookId) || [];
      list.push({
        id: row.id,
        keys: (parseJson(row.keys) as string[]) || [],
        secondary_keys: (parseJson(row.secondaryKeys) as string[]) || [],
        selective_logic: row.selectiveLogic || "AND",
        content: row.content,
        position: normalizePosition(row.position),
        depth: row.depth || 4,
        enabled: toBool(row.enabled),
        constant: toBool(row.constant),
        order: row.sortOrder ?? 100,
        conditions: normalizeVariableConditions(parseJson(row.conditionsJson)),
        condition_logic: normalizeConditionLogic(row.conditionLogic),
      });
      grouped.set(row.bookId, list);
    }

    return rows.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || "",
      enabled: toBool(item.enabled),
      entries: grouped.get(item.id) || [],
    }));
  }

  createWorldInfoBook(name: string, description = "", enabled = true): WorldInfoBook {
    const id = randomUUID();
    this.db
      .insert(worldInfoBooks)
      .values({
        id,
        name,
        description,
        enabled: Boolean(enabled),
      })
      .run();
    return { id, name, description, enabled: Boolean(enabled), entries: [] };
  }

  saveWorldInfoBook(book: WorldInfoBook): WorldInfoBook {
    this.db
      .insert(worldInfoBooks)
      .values({
        id: book.id,
        name: book.name,
        description: book.description || "",
        enabled: Boolean(book.enabled),
      })
      .onConflictDoUpdate({
        target: worldInfoBooks.id,
        set: {
          name: book.name,
          description: book.description || "",
          enabled: Boolean(book.enabled),
        },
      })
      .run();

    // Keep entries untouched here; entry mutation is handled by upsertWorldInfoEntry.
    return this.getWorldInfoBook(book.id) || book;
  }

  getWorldInfoBook(bookId: string): WorldInfoBook | undefined {
    const row = this.db
      .select()
      .from(worldInfoBooks)
      .where(eq(worldInfoBooks.id, bookId))
      .get();

    if (!row) return undefined;
    const entries = this.db
      .select()
      .from(worldInfoEntries)
      .where(eq(worldInfoEntries.bookId, bookId))
      .orderBy(asc(worldInfoEntries.sortOrder))
      .all()
      .map((item) => ({
        id: item.id,
        keys: (parseJson(item.keys) as string[]) || [],
        secondary_keys: (parseJson(item.secondaryKeys) as string[]) || [],
        selective_logic: item.selectiveLogic || "AND",
        content: item.content,
        position: normalizePosition(item.position),
        depth: item.depth || 4,
        enabled: toBool(item.enabled),
        constant: toBool(item.constant),
        order: item.sortOrder || 100,
        conditions: normalizeVariableConditions(parseJson(item.conditionsJson)),
        condition_logic: normalizeConditionLogic(item.conditionLogic),
      }));

    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      enabled: toBool(row.enabled),
      entries,
    };
  }

  deleteWorldInfoBook(bookId: string): void {
    this.db.delete(worldInfoEntries).where(eq(worldInfoEntries.bookId, bookId)).run();
    this.db.delete(worldInfoBooks).where(eq(worldInfoBooks.id, bookId)).run();
    this.db.delete(roomWorldInfo).where(eq(roomWorldInfo.bookId, bookId)).run();
  }

  upsertWorldInfoEntry(bookId: string, entry: WorldInfoEntry): WorldInfoEntry {
    this.db
      .insert(worldInfoEntries)
      .values({
        id: entry.id,
        bookId,
        keys: toJson(entry.keys || []),
        secondaryKeys: toJson(entry.secondary_keys || []),
        selectiveLogic: entry.selective_logic || "AND",
        content: entry.content || "",
        position: entry.position || "after_char",
        depth: entry.depth || 4,
        enabled: Boolean(entry.enabled),
        constant: Boolean(entry.constant),
        sortOrder: entry.order ?? 100,
        conditionsJson: toJson(normalizeVariableConditions(entry.conditions)),
        conditionLogic: normalizeConditionLogic(entry.condition_logic),
      })
      .onConflictDoUpdate({
        target: worldInfoEntries.id,
        set: {
          bookId,
          keys: toJson(entry.keys || []),
          secondaryKeys: toJson(entry.secondary_keys || []),
          selectiveLogic: entry.selective_logic || "AND",
          content: entry.content || "",
          position: entry.position || "after_char",
          depth: entry.depth || 4,
          enabled: Boolean(entry.enabled),
          constant: Boolean(entry.constant),
          sortOrder: entry.order ?? 100,
          conditionsJson: toJson(normalizeVariableConditions(entry.conditions)),
          conditionLogic: normalizeConditionLogic(entry.condition_logic),
        },
      })
      .run();

    return this.getWorldInfoBook(bookId)?.entries.find((it) => it.id === entry.id) || entry;
  }

  deleteWorldInfoEntry(bookId: string, entryId: string): boolean {
    const result = this.db
      .delete(worldInfoEntries)
      .where(and(eq(worldInfoEntries.id, entryId), eq(worldInfoEntries.bookId, bookId)))
      .run();
    return result.changes > 0;
  }

  getRoomWorldInfo(roomId: string): WorldInfoBook[] {
    const bookIds = this.db
      .select({ bookId: roomWorldInfo.bookId })
      .from(roomWorldInfo)
      .where(eq(roomWorldInfo.roomId, roomId))
      .all()
      .map((item) => item.bookId);

    return this.listWorldInfoBooks().filter((book) => bookIds.includes(book.id));
  }

  setRoomWorldInfo(roomId: string, bookIds: string[]): void {
    this.db.delete(roomWorldInfo).where(eq(roomWorldInfo.roomId, roomId)).run();
    const rooms = this.getRoom(roomId);
    if (!rooms) {
      return;
    }

    if (bookIds.length === 0) return;

    const existing = new Set(this.listWorldInfoBooks().map((item) => item.id));
    const normalized = bookIds.filter((id) => existing.has(id));
    if (normalized.length === 0) return;

    for (const bookId of normalized) {
      this.db
        .insert(roomWorldInfo)
        .values({ roomId, bookId })
        .onConflictDoNothing()
        .run();
    }
  }

  listBehaviorRules(roomId: string): BehaviorRule[] {
    return this.db
      .select()
      .from(behaviorRules)
      .where(eq(behaviorRules.roomId, roomId))
      .orderBy(asc(behaviorRules.priority), asc(behaviorRules.createdAt))
      .all()
      .map((row) => ({
        id: row.id,
        room_id: row.roomId,
        name: row.name,
        enabled: toBool(row.enabled),
        priority: row.priority ?? 100,
        conditions: normalizeVariableConditions(parseJson(row.conditionsJson)),
        condition_logic: normalizeConditionLogic(row.conditionLogic),
        prompt_text: row.promptText || "",
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }));
  }

  upsertBehaviorRule(rule: BehaviorRule): BehaviorRule {
    this.db
      .insert(behaviorRules)
      .values({
        id: rule.id,
        roomId: rule.room_id,
        name: rule.name,
        enabled: Boolean(rule.enabled),
        priority: rule.priority,
        conditionsJson: toJson(normalizeVariableConditions(rule.conditions)),
        conditionLogic: normalizeConditionLogic(rule.condition_logic),
        promptText: rule.prompt_text || "",
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
      })
      .onConflictDoUpdate({
        target: behaviorRules.id,
        set: {
          roomId: rule.room_id,
          name: rule.name,
          enabled: Boolean(rule.enabled),
          priority: rule.priority,
          conditionsJson: toJson(normalizeVariableConditions(rule.conditions)),
          conditionLogic: normalizeConditionLogic(rule.condition_logic),
          promptText: rule.prompt_text || "",
          updatedAt: rule.updated_at,
        },
      })
      .run();

    return this.listBehaviorRules(rule.room_id).find((item) => item.id === rule.id) || rule;
  }

  deleteBehaviorRule(roomId: string, ruleId: string): boolean {
    const result = this.db
      .delete(behaviorRules)
      .where(and(eq(behaviorRules.id, ruleId), eq(behaviorRules.roomId, roomId)))
      .run();
    return result.changes > 0;
  }

  getCharacter(characterId: string): Character | undefined {
    const row = this.db.select().from(characters).where(eq(characters.id, characterId)).get();
    if (!row) return undefined;

    const examples = this.getWorldInfoEntriesByCharacter(row.id);
    return {
      id: row.id,
      name: row.name,
      personality: row.personality,
      background: row.background,
      description: row.description || "",
      scenario: row.scenario || "",
      speaking_style: row.speakingStyle || "",
      system_prompt_override: row.systemPromptOverride || "",
      post_instructions: row.postInstructions || "",
      greeting: row.greeting || "",
      creator_notes: row.creatorNotes || "",
      tags: (parseJson(row.tags) as string[]) || [],
      is_active: toBool(row.isActive),
      example_dialogues: examples,
      avatar: row.avatar || undefined,
    };
  }

  getWorldInfoEntriesByCharacter(characterId: string): Character["example_dialogues"] {
    const rows = this.db
      .select()
      .from(exampleDialogues)
      .where(eq(exampleDialogues.characterId, characterId))
      .orderBy(asc(exampleDialogues.sortOrder))
      .all();

    return rows.map((item) => ({
      user_message: item.userMessage,
      character_response: item.characterResponse,
    }));
  }

  getSetting(key: string, defaultValue = ""): string {
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .get();

    return row ? row.value : defaultValue;
  }

  setSetting(key: string, value: string): void {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value,
        },
      })
      .run();
  }

  getRoomBar(roomId: string): RoomBarSnapshot | null {
    const row = this.db.select().from(roomBar).where(eq(roomBar.roomId, roomId)).get();
    if (!row) {
      return null;
    }

    return {
      room_id: row.roomId,
      content: row.content,
      label: row.label,
      version: row.version,
      updated_at: row.updatedAt,
    };
  }

  upsertRoomBar(snapshot: RoomBarSnapshot): RoomBarSnapshot {
    this.db
      .insert(roomBar)
      .values({
        roomId: snapshot.room_id,
        content: snapshot.content,
        label: snapshot.label,
        version: snapshot.version,
        updatedAt: snapshot.updated_at,
      })
      .onConflictDoUpdate({
        target: roomBar.roomId,
        set: {
          content: snapshot.content,
          label: snapshot.label,
          version: snapshot.version,
          updatedAt: snapshot.updated_at,
        },
      })
      .run();

    return snapshot;
  }

  private mapPendingAskRow(row: typeof pendingAsks.$inferSelect): PendingAsk {
    let choices: string[] = [];
    try {
      choices = JSON.parse(row.choicesJson) as string[];
    } catch {
      choices = [];
    }

    let answer: AskAnswer | undefined;
    if (row.answerJson) {
      try {
        answer = JSON.parse(row.answerJson) as AskAnswer;
      } catch {
        answer = undefined;
      }
    }

    return {
      id: row.id,
      room_id: row.roomId,
      request_id: row.requestId,
      character_id: row.characterId,
      tool_call_id: row.toolCallId,
      question: row.question,
      choices,
      allow_custom: Boolean(row.allowCustom),
      multiple: Boolean(row.multiple),
      status: row.status as PendingAsk["status"],
      answer,
      agent_messages_json: row.agentMessagesJson,
      system_prompt: row.systemPrompt,
      provider: row.provider,
      model: row.model,
      created_at: row.createdAt,
      resolved_at: row.resolvedAt || undefined,
    };
  }

  expireRoomPendingAsks(roomId: string, expiredAt: string): number {
    const result = this.db
      .update(pendingAsks)
      .set({
        status: "expired",
        resolvedAt: expiredAt,
      })
      .where(and(eq(pendingAsks.roomId, roomId), eq(pendingAsks.status, "pending")))
      .run();

    return result.changes;
  }

  createPendingAsk(input: {
    id: string;
    roomId: string;
    requestId: string;
    characterId: string;
    toolCallId: string;
    question: string;
    choices: string[];
    allowCustom: boolean;
    multiple: boolean;
    agentMessagesJson: string;
    systemPrompt: string;
    provider: string;
    model: string;
    createdAt: string;
  }): PendingAsk {
    this.expireRoomPendingAsks(input.roomId, input.createdAt);

    this.db
      .insert(pendingAsks)
      .values({
        id: input.id,
        roomId: input.roomId,
        requestId: input.requestId,
        characterId: input.characterId,
        toolCallId: input.toolCallId,
        question: input.question,
        choicesJson: JSON.stringify(input.choices),
        allowCustom: input.allowCustom,
        multiple: input.multiple,
        status: "pending",
        agentMessagesJson: input.agentMessagesJson,
        systemPrompt: input.systemPrompt,
        provider: input.provider,
        model: input.model,
        createdAt: input.createdAt,
      })
      .run();

    const row = this.db.select().from(pendingAsks).where(eq(pendingAsks.id, input.id)).get();
    return this.mapPendingAskRow(row!);
  }

  getPendingAsk(askId: string): PendingAsk | undefined {
    const row = this.db.select().from(pendingAsks).where(eq(pendingAsks.id, askId)).get();
    return row ? this.mapPendingAskRow(row) : undefined;
  }

  getRoomPendingAsk(roomId: string): PendingAsk | undefined {
    const row = this.db
      .select()
      .from(pendingAsks)
      .where(and(eq(pendingAsks.roomId, roomId), eq(pendingAsks.status, "pending")))
      .orderBy(asc(pendingAsks.createdAt))
      .all()
      .at(-1);

    return row ? this.mapPendingAskRow(row) : undefined;
  }

  resolvePendingAsk(askId: string, answer: AskAnswer, resolvedAt: string): PendingAsk | undefined {
    const row = this.db.select().from(pendingAsks).where(eq(pendingAsks.id, askId)).get();
    if (!row || row.status !== "pending") {
      return undefined;
    }

    this.db
      .update(pendingAsks)
      .set({
        status: "resolved",
        answerJson: JSON.stringify(answer),
        resolvedAt,
      })
      .where(eq(pendingAsks.id, askId))
      .run();

    return this.getPendingAsk(askId);
  }

  listRoomSummaries(roomId: string): RoomSummary[] {
    const rows = this.db
      .select()
      .from(roomSummaries)
      .where(eq(roomSummaries.roomId, roomId))
      .orderBy(asc(roomSummaries.createdAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      room_id: row.roomId,
      start_message_id: row.startMessageId,
      end_message_id: row.endMessageId,
      message_count: row.messageCount,
      summary: row.summary,
      source: row.source === "llm" ? "llm" : "deterministic",
      created_at: row.createdAt,
    }));
  }

  saveRoomSummary(summary: RoomSummary): RoomSummary {
    this.db
      .insert(roomSummaries)
      .values({
        id: summary.id,
        roomId: summary.room_id,
        startMessageId: summary.start_message_id,
        endMessageId: summary.end_message_id,
        messageCount: summary.message_count,
        summary: summary.summary,
        source: summary.source,
        createdAt: summary.created_at,
      })
      .onConflictDoUpdate({
        target: roomSummaries.id,
        set: {
          roomId: summary.room_id,
          startMessageId: summary.start_message_id,
          endMessageId: summary.end_message_id,
          messageCount: summary.message_count,
          summary: summary.summary,
          source: summary.source,
          createdAt: summary.created_at,
        },
      })
      .run();

    return summary;
  }

  listRoomArchives(roomId: string): RoomArchiveRecord[] {
    const rows = this.db
      .select()
      .from(roomArchives)
      .where(eq(roomArchives.roomId, roomId))
      .orderBy(asc(roomArchives.createdAt))
      .all();

    return rows.map((row) => this.mapRoomArchiveRecord(row));
  }

  getRoomArchive(archiveId: string): RoomArchiveRecord | undefined {
    const row = this.db.select().from(roomArchives).where(eq(roomArchives.id, archiveId)).get();
    return row ? this.mapRoomArchiveRecord(row) : undefined;
  }

  saveRoomArchive(record: RoomArchiveRecord): RoomArchiveRecord {
    this.db
      .insert(roomArchives)
      .values({
        id: record.id,
        roomId: record.room_id,
        title: record.title,
        manifestJson: toJson(record.manifest),
        filePath: record.file_path || null,
        createdAt: record.created_at,
      })
      .onConflictDoUpdate({
        target: roomArchives.id,
        set: {
          roomId: record.room_id,
          title: record.title,
          manifestJson: toJson(record.manifest),
          filePath: record.file_path || null,
          createdAt: record.created_at,
        },
      })
      .run();

    return record;
  }

  private mapRoomArchiveRecord(row: typeof roomArchives.$inferSelect): RoomArchiveRecord {
    const manifest = parseJson(row.manifestJson) as RoomArchiveManifest | null;
    return {
      id: row.id,
      room_id: row.roomId,
      title: row.title,
      manifest: manifest || {
        schema_version: 1,
        archive_id: row.id,
        room_id: row.roomId,
        title: row.title,
        created_at: row.createdAt,
        message_count: 0,
        summary_count: 0,
        variable_count: 0,
        world_info_book_ids: [],
      },
      file_path: row.filePath || undefined,
      created_at: row.createdAt,
    };
  }
}
