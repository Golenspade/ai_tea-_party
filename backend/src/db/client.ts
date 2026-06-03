import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const DEFAULT_DB_PATH = "data/tea_party.db";

function resolveDbPath(): string {
  return process.env.DB_PATH || process.env.DATABASE_URL || DEFAULT_DB_PATH;
}

export function createDatabase(): {
  db: BetterSQLite3Database<typeof schema>;
  client: Database.Database;
} {
  const dbPath = resolveDbPath();
  const absoluteDir = dirname(dbPath);
  if (absoluteDir && absoluteDir !== ".") {
    mkdirSync(absoluteDir, { recursive: true });
  }

  const client = new Database(dbPath);
  client.pragma("foreign_keys = ON");

  const db = drizzle(client, { schema });
  return { db, client };
}

function hasColumn(
  client: Database.Database,
  table: string,
  column: string,
): boolean {
  const rows = client
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function ensureColumn(
  client: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!hasColumn(client, table, column)) {
    client.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

export function ensureSchema(client: Database.Database): void {
  client.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      stealth_mode INTEGER DEFAULT 0,
      user_description TEXT DEFAULT '',
      persona_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      max_history INTEGER NOT NULL DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      personality TEXT NOT NULL,
      background TEXT NOT NULL,
      description TEXT DEFAULT '',
      scenario TEXT DEFAULT '',
      speaking_style TEXT DEFAULT '',
      system_prompt_override TEXT DEFAULT '',
      post_instructions TEXT DEFAULT '',
      greeting TEXT DEFAULT '',
      creator_notes TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      avatar TEXT
    );

    CREATE TABLE IF NOT EXISTS room_characters (
      room_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      PRIMARY KEY (room_id, character_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_system INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL,
      sender_type TEXT DEFAULT NULL,
      sender_user_id TEXT DEFAULT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS example_dialogues (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      user_message TEXT NOT NULL,
      character_response TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS world_info_books (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS world_info_entries (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      keys TEXT NOT NULL,
      secondary_keys TEXT DEFAULT '[]',
      selective_logic TEXT DEFAULT 'AND',
      content TEXT NOT NULL,
      position TEXT DEFAULT 'after_char',
      depth INTEGER DEFAULT 4,
      enabled INTEGER DEFAULT 1,
      constant INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 100,
      FOREIGN KEY (book_id) REFERENCES world_info_books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_worldinfo (
      room_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      PRIMARY KEY (room_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS room_variables (
      room_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'room',
      name TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (room_id, scope, name)
    );

    CREATE TABLE IF NOT EXISTS global_variables (
      name TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_room_characters_room ON room_characters(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_example_dialogues_char ON example_dialogues(character_id);
    CREATE INDEX IF NOT EXISTS idx_wi_entries_book ON world_info_entries(book_id);
    CREATE INDEX IF NOT EXISTS idx_room_variables_room_name ON room_variables(room_id, name);
  `);

  ensureColumn(client, "rooms", "max_history", "INTEGER DEFAULT 50");
  ensureColumn(client, "characters", "avatar", "TEXT");
  ensureColumn(client, "messages", "sender_type", "TEXT");
  ensureColumn(client, "messages", "sender_user_id", "TEXT");

  client.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_room_variables_name ON room_variables(name);
    CREATE INDEX IF NOT EXISTS idx_room_variables_room_name ON room_variables(room_id, name);
  `);
}
