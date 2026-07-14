import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ChatRoom,
  BehaviorRule,
  Message,
  RoomArchive,
  RoomArchiveManifest,
  RoomArchiveRecord,
  RoomBarSnapshot,
  RoomSummary,
  VariableDisplay,
  VariableEntry,
  WorldInfoBook,
} from "@ai-party/shared";

export const ROOM_ARCHIVE_SCHEMA_VERSION = 1;

export interface BuildRoomArchiveSnapshotInput {
  archiveId: string;
  title: string;
  createdAt: string;
  room: ChatRoom;
  messages: Message[];
  summaries: RoomSummary[];
  roomVariables: VariableEntry[];
  globalVariables: VariableEntry[];
  roomBar: RoomBarSnapshot | null;
  worldInfoBooks: WorldInfoBook[];
  behaviorRules?: BehaviorRule[];
  variableDisplays?: VariableDisplay[];
}

export function buildRoomArchiveSnapshot(input: BuildRoomArchiveSnapshotInput): RoomArchive {
  const manifest: RoomArchiveManifest = {
    schema_version: ROOM_ARCHIVE_SCHEMA_VERSION,
    archive_id: input.archiveId,
    room_id: input.room.id,
    title: input.title,
    created_at: input.createdAt,
    message_count: input.messages.length,
    summary_count: input.summaries.length,
    variable_count: input.roomVariables.length + input.globalVariables.length,
    bar_version: input.roomBar?.version,
    world_info_book_ids: input.worldInfoBooks.map((book) => book.id),
  };

  return {
    manifest,
    room: {
      ...input.room,
      messages: input.messages,
    },
    messages: input.messages,
    summaries: input.summaries,
    room_variables: input.roomVariables.map((item) => ({
      name: item.name,
      value: item.value,
      scope: "room",
    })),
    global_variables: input.globalVariables.map((item) => ({
      name: item.name,
      value: item.value,
      scope: "global",
    })),
    room_bar: input.roomBar,
    world_info_books: input.worldInfoBooks,
    behavior_rules: input.behaviorRules || [],
    variable_displays: input.variableDisplays || [],
  };
}

export function resolveArchiveRoot(): string {
  return process.env.ARCHIVE_DIR || join("data", "archives");
}

export function writeRoomArchiveFile(archive: RoomArchive, rootDir = resolveArchiveRoot()): string {
  const roomDir = join(rootDir, archive.manifest.room_id);
  mkdirSync(roomDir, { recursive: true });
  const filePath = join(roomDir, `${archive.manifest.archive_id}.json`);
  writeFileSync(filePath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  return filePath;
}

export function readRoomArchiveFile(record: RoomArchiveRecord): RoomArchive {
  if (!record.file_path) {
    throw new Error("Archive file path is missing");
  }

  return JSON.parse(readFileSync(record.file_path, "utf8")) as RoomArchive;
}
