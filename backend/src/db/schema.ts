import { integer, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    stealthMode: integer("stealth_mode", { mode: "boolean" }).notNull().default(0),
    userDescription: text("user_description").notNull().default(""),
    personaId: text("persona_id"),
    createdAt: text("created_at").notNull(),
    maxHistory: integer("max_history").notNull().default(50),
  },
  (table) => ({}),
);

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    personality: text("personality").notNull(),
    background: text("background").notNull(),
    description: text("description").notNull().default(""),
    scenario: text("scenario").notNull().default(""),
    speakingStyle: text("speaking_style").notNull().default(""),
    systemPromptOverride: text("system_prompt_override").notNull().default(""),
    postInstructions: text("post_instructions").notNull().default(""),
    greeting: text("greeting").notNull().default(""),
    creatorNotes: text("creator_notes").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(1),
    avatar: text("avatar"),
  },
  (table) => ({}),
);

export const roomCharacters = sqliteTable(
  "room_characters",
  {
    roomId: text("room_id").notNull(),
    characterId: text("character_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.characterId] }),
  }),
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    characterId: text("character_id").notNull(),
    characterName: text("character_name").notNull(),
    content: text("content").notNull(),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(0),
    timestamp: text("timestamp").notNull(),
    senderType: text("sender_type"),
    senderUserId: text("sender_user_id"),
  },
  (table) => ({
    roomIdx: index("idx_messages_room_id").on(table.roomId),
    timeIdx: index("idx_messages_timestamp").on(table.timestamp),
  }),
);

export const exampleDialogues = sqliteTable(
  "example_dialogues",
  {
    id: text("id").primaryKey(),
    characterId: text("character_id").notNull(),
    userMessage: text("user_message").notNull(),
    characterResponse: text("character_response").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    charIdx: index("idx_example_dialogues_char").on(table.characterId),
  }),
);

export const personas = sqliteTable(
  "personas",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(0),
  },
  (table) => ({}),
);

export const worldInfoBooks = sqliteTable(
  "world_info_books",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(1),
  },
  (table) => ({}),
);

export const worldInfoEntries = sqliteTable(
  "world_info_entries",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id").notNull(),
    keys: text("keys").notNull(),
    secondaryKeys: text("secondary_keys").notNull().default("[]"),
    selectiveLogic: text("selective_logic").notNull().default("AND"),
    content: text("content").notNull(),
    position: text("position").notNull().default("after_char"),
    depth: integer("depth").notNull().default(4),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(1),
    constant: integer("constant", { mode: "boolean" }).notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(100),
  },
  (table) => ({
    bookIdx: index("idx_wi_entries_book").on(table.bookId),
  }),
);

export const roomWorldInfo = sqliteTable(
  "room_worldinfo",
  {
    roomId: text("room_id").notNull(),
    bookId: text("book_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.bookId] }),
  }),
);

export const roomVariables = sqliteTable(
  "room_variables",
  {
    roomId: text("room_id").notNull(),
    scope: text("scope").notNull().default("room"),
    name: text("name").notNull(),
    valueJson: text("value_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.scope, table.name] }),
    roomNameIdx: index("idx_room_variables_room_name").on(table.roomId, table.name),
    roomNameFlatIdx: index("idx_room_variables_name").on(table.name),
  }),
);

export const globalVariables = sqliteTable(
  "global_variables",
  {
    name: text("name").primaryKey(),
    valueJson: text("value_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  () => ({}),
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
