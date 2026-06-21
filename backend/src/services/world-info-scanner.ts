import type {
  Character,
  Message,
  WorldInfoBook,
  WorldInfoEntry,
} from "@ai-party/shared";
import {
  evaluateVariableConditions,
  type VariableConditionContext,
} from "./variable-conditions";

export interface ActivatedEntry {
  entry: WorldInfoEntry;
  bookName: string;
}

export interface ScanResult {
  before_char: ActivatedEntry[];
  after_char: ActivatedEntry[];
  before_examples: ActivatedEntry[];
  after_examples: ActivatedEntry[];
  at_depth: ActivatedEntry[];
  system_top: ActivatedEntry[];
  system_bottom: ActivatedEntry[];
}

export interface WorldInfoScanOptions {
  variableContext?: VariableConditionContext;
}

export function createEmptyScanResult(): ScanResult {
  return {
    before_char: [],
    after_char: [],
    before_examples: [],
    after_examples: [],
    at_depth: [],
    system_top: [],
    system_bottom: [],
  };
}

export function getScanResultByPosition(
  result: ScanResult,
  position: WorldInfoEntry["position"],
): ActivatedEntry[] {
  switch (position) {
    case "before_char":
      return result.before_char;
    case "after_char":
      return result.after_char;
    case "before_examples":
      return result.before_examples;
    case "after_examples":
      return result.after_examples;
    case "at_depth":
      return result.at_depth;
    case "system_top":
      return result.system_top;
    case "system_bottom":
      return result.system_bottom;
    default:
      return [];
  }
}

export function countActivatedEntries(result: ScanResult): number {
  return (
    result.before_char.length +
    result.after_char.length +
    result.before_examples.length +
    result.after_examples.length +
    result.at_depth.length +
    result.system_top.length +
    result.system_bottom.length
  );
}

export function buildWorldInfoScanText(
  character: Character,
  chatHistory: Message[],
  personaDescription = "",
): string {
  const parts: string[] = [
    character.personality,
    character.background,
    character.description || "",
    character.scenario || "",
    character.creator_notes || "",
  ];

  if (personaDescription.trim()) {
    parts.push(personaDescription.trim());
  }

  for (const message of chatHistory.slice(-30)) {
    if (!message.is_system) {
      parts.push(message.content);
    }
  }

  return parts.filter(Boolean).join("\n");
}

function sortByOrder(entries: ActivatedEntry[]): void {
  entries.sort((left, right) => left.entry.order - right.entry.order);
}

function routeActivatedEntry(activated: ActivatedEntry, result: ScanResult): void {
  switch (activated.entry.position) {
    case "before_char":
      result.before_char.push(activated);
      break;
    case "after_char":
      result.after_char.push(activated);
      break;
    case "before_examples":
      result.before_examples.push(activated);
      break;
    case "after_examples":
      result.after_examples.push(activated);
      break;
    case "at_depth":
      result.at_depth.push(activated);
      break;
    case "system_top":
      result.system_top.push(activated);
      break;
    case "system_bottom":
      result.system_bottom.push(activated);
      break;
    default:
      break;
  }
}

function keywordInText(keyword: string, text: string): boolean {
  const normalized = keyword.toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i").test(text);
}

function matchesEntry(entry: WorldInfoEntry, scanTextLower: string): boolean {
  const primaryHit = entry.keys.some((key) => keywordInText(key, scanTextLower));
  if (!primaryHit) {
    return false;
  }

  if (entry.secondary_keys.length === 0) {
    return true;
  }

  if (entry.selective_logic === "AND") {
    return entry.secondary_keys.some((key) => keywordInText(key, scanTextLower));
  }

  if (entry.selective_logic === "NOT") {
    return !entry.secondary_keys.some((key) => keywordInText(key, scanTextLower));
  }

  return true;
}

export class WorldInfoScanner {
  scan(books: WorldInfoBook[], scanText: string, options: WorldInfoScanOptions = {}): ScanResult {
    const result = createEmptyScanResult();
    const scanLower = scanText.toLowerCase();
    const variableContext = options.variableContext || { room: {}, global: {} };

    for (const book of books) {
      if (!book.enabled) {
        continue;
      }

      for (const entry of book.entries) {
        if (!entry.enabled) {
          continue;
        }

        const matchesTrigger = entry.constant || matchesEntry(entry, scanLower);
        const matchesConditions = evaluateVariableConditions(
          entry.conditions,
          entry.condition_logic,
          variableContext,
        );

        if (matchesTrigger && matchesConditions) {
          routeActivatedEntry({ entry, bookName: book.name }, result);
        }
      }
    }

    for (const group of [
      result.before_char,
      result.after_char,
      result.before_examples,
      result.after_examples,
      result.at_depth,
      result.system_top,
      result.system_bottom,
    ]) {
      sortByOrder(group);
    }

    return result;
  }
}
