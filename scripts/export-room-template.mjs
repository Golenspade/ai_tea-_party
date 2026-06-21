#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function slugify(value, fallback = "room-template") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function stripCharacter(character) {
  return {
    id: character.id,
    name: character.name,
    personality: character.personality || "",
    background: character.background || "",
    speaking_style: character.speaking_style || "",
    description: character.description || "",
    scenario: character.scenario || "",
    system_prompt_override: character.system_prompt_override || "",
    post_instructions: character.post_instructions || "",
    greeting: character.greeting || "",
    creator_notes: character.creator_notes || "",
    tags: character.tags || [],
    example_dialogues: character.example_dialogues || [],
    avatar: character.avatar,
  };
}

export function archiveToTemplate(archive, options = {}) {
  const room = archive.room || {};
  const templateId = slugify(options.templateId || room.id || archive.manifest?.room_id);
  const roomId = room.id || archive.manifest?.room_id || templateId;

  return {
    schema_version: 1,
    template_id: templateId,
    name: options.name || `${room.name || archive.manifest?.title || "Room"} Template`,
    description: options.description || `Generated from archive ${archive.manifest?.archive_id || ""}`.trim(),
    source_archive_id: archive.manifest?.archive_id,
    source_created_at: archive.manifest?.created_at,
    rooms: [
      {
        id: roomId,
        name: room.name || "Unnamed Room",
        description: room.description || "",
        stealth_mode: Boolean(room.stealth_mode),
        user_description: room.user_description || "",
        max_history: room.max_history || 50,
        characters: (room.characters || []).map(stripCharacter),
        room_variables: archive.room_variables || [],
        global_variables: archive.global_variables || [],
        room_bar: archive.room_bar || null,
        world_info_books: archive.world_info_books || [],
        behavior_rules: archive.behavior_rules || [],
      },
    ],
  };
}

export function exportRoomTemplate(archivePath, outputDir) {
  const archive = JSON.parse(readFileSync(archivePath, "utf8"));
  const template = archiveToTemplate(archive, {
    templateId: slugify(archive.room?.id || basename(archivePath, ".json")),
  });

  if (!outputDir) {
    return { template, outputPath: null };
  }

  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "template.json");
  writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  return { template, outputPath };
}

function printUsage() {
  console.error("Usage: node scripts/export-room-template.mjs <archive.json> [output-dir]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivePath = process.argv[2];
  const outputDir = process.argv[3];

  if (!archivePath) {
    printUsage();
    process.exit(1);
  }

  try {
    const { template, outputPath } = exportRoomTemplate(
      resolve(archivePath),
      outputDir ? resolve(outputDir) : undefined,
    );

    if (outputPath) {
      console.log(outputPath);
    } else {
      process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
