/**
 * 将 data/tea_party.db 升级到当前 schema（ensureSchema）。
 * 用法（仓库根目录）: pnpm --filter ai-tea-party-backend exec tsx scripts/migrate-db.ts
 *
 * 步骤：备份 → ensureSchema → 校验行数与表清单
 */
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabase, ensureSchema } from "../src/db/client";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dbPath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(repoRoot, "data/tea_party.db");

if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${dbPath}.bak-${stamp}`;
copyFileSync(dbPath, backupPath);
console.log(`Backup: ${backupPath}`);

const { client } = createDatabase();
if (client.name !== dbPath) {
  console.error(`Expected DB ${dbPath}, opened ${client.name}`);
  process.exit(1);
}

const beforeTables = client
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as Array<{ name: string }>;

ensureSchema(client);

const afterTables = client
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as Array<{ name: string }>;

const counts = client
  .prepare(`
    SELECT 'rooms' AS tbl, COUNT(*) AS cnt FROM rooms
    UNION ALL SELECT 'characters', COUNT(*) FROM characters
    UNION ALL SELECT 'messages', COUNT(*) FROM messages
    UNION ALL SELECT 'room_characters', COUNT(*) FROM room_characters
  `)
  .all() as Array<{ tbl: string; cnt: number }>;

const roomCols = (
  client.prepare("PRAGMA table_info(rooms)").all() as Array<{ name: string }>
).map((r) => r.name);

const messageCols = (
  client.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>
).map((r) => r.name);

client.close();

const addedTables = afterTables
  .map((t) => t.name)
  .filter((n) => !beforeTables.some((b) => b.name === n));

console.log(`DB: ${dbPath}`);
console.log(`Tables: ${beforeTables.length} → ${afterTables.length}`);
if (addedTables.length > 0) {
  console.log(`New tables: ${addedTables.join(", ")}`);
}
console.log("Row counts:", Object.fromEntries(counts.map((r) => [r.tbl, r.cnt])));
console.log("rooms columns:", roomCols.join(", "));
console.log("messages columns:", messageCols.join(", "));
console.log("Migration complete.");
