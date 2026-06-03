import type { VariableEntry } from "@ai-party/shared";

export type VariableScope = "room" | "global";

export interface VariableCommandResult {
  handled: boolean;
  output: string;
}

export interface VariableOps {
  roomId: string;
  listRoomVariables: () => Record<string, unknown>;
  listGlobalVariables: () => Record<string, unknown>;
  getRoomVariable: (name: string) => unknown | undefined;
  getGlobalVariable: (name: string) => unknown | undefined;
  roomVariableExists: (name: string) => boolean;
  globalVariableExists: (name: string) => boolean;
  setRoomVariable: (name: string, value: unknown) => void;
  setGlobalVariable: (name: string, value: unknown) => void;
  addRoomVariable: (name: string, value: unknown) => unknown;
  addGlobalVariable: (name: string, value: unknown) => unknown;
  incRoomVariable: (name: string, delta: unknown) => unknown;
  incGlobalVariable: (name: string, delta: unknown) => unknown;
  decRoomVariable: (name: string, delta: unknown) => unknown;
  decGlobalVariable: (name: string, delta: unknown) => unknown;
  deleteRoomVariable: (name: string) => void;
  deleteGlobalVariable: (name: string) => void;
}

const VAR_MACRO_RE = /\{\{\s*([^{}]+)\s*\}\}/g;

function tokenizeCommandValue(raw: string): string[] {
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s]+)/g;
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    result.push((match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return result;
}

function parseCommand(content: string): { op: string | null; args: string[] } {
  const text = content.trim();
  if (!text.startsWith("/")) {
    return { op: null, args: [] };
  }

  const commandLine = text.slice(1).trim();
  if (!commandLine) {
    return { op: null, args: [] };
  }

  const spaceIndex = commandLine.indexOf(" ");
  if (spaceIndex === -1) {
    return { op: commandLine.toLowerCase(), args: [] };
  }

  return {
    op: commandLine.slice(0, spaceIndex).toLowerCase(),
    args: tokenizeCommandValue(commandLine.slice(spaceIndex + 1).trim()),
  };
}

export function parseVariableValue(raw: string): unknown {
  if (raw === undefined || raw === null) {
    return "";
  }

  const value = raw.trim();
  if (!value) {
    return "";
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const lower = value.toLowerCase();
  if (["true", "yes", "on", "1"].includes(lower)) {
    return true;
  }
  if (["false", "off", "no", "0"].includes(lower)) {
    return false;
  }
  if (["null", "none", "nil"].includes(lower)) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value.includes(".") ? Number.parseFloat(value) : Number.parseInt(value, 10);
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return raw;
  }
}

function formatVariableOutput(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function extractNameAndValue(args: string[], defaultValue = ""): [string, string] {
  if (args.length === 0) {
    return ["", defaultValue];
  }

  const first = args[0]?.trim() || "";
  const rest = args.slice(1).join(" ").trim();

  if (first.startsWith("key=")) {
    const name = first.slice("key=".length).trim();
    let value = rest;
    if (value.startsWith("value=")) {
      value = value.slice("value=".length).trim();
    }
    return [name, value];
  }

  if (first.startsWith("name=")) {
    return [first.slice("name=".length).trim(), rest];
  }

  return [first, rest];
}

export function parseVariableExpression(raw: string): [string, number | null, string | null] {
  const parts = raw.split("::").map((part) => part.trim());
  if (!parts[0]) {
    return [raw, null, null];
  }

  const name = parts[0];
  let index: number | null = null;
  let cast: string | null = null;

  if (parts.length === 2) {
    if (parts[1]?.toLowerCase() === "as") {
      return [raw, null, null];
    }
    const parsed = Number.parseInt(parts[1] || "", 10);
    if (!Number.isNaN(parsed) && parts[1] === String(parsed)) {
      index = parsed;
    } else {
      cast = parts[1]?.toLowerCase() || null;
    }
  } else if (parts.length === 3) {
    if (parts[1]?.toLowerCase() === "as") {
      cast = parts[2]?.toLowerCase() || null;
    } else {
      return [raw, null, null];
    }
  } else if (parts.length === 4 && parts[2]?.toLowerCase() === "as") {
    const parsed = Number.parseInt(parts[1] || "", 10);
    if (Number.isNaN(parsed)) {
      return [raw, null, null];
    }
    index = parsed;
    cast = parts[3]?.toLowerCase() || null;
  } else if (parts.length > 2) {
    return [raw, null, null];
  }

  return [name, index, cast];
}

function extractByIndex(value: unknown, index: number | null): unknown {
  if (index === null) {
    return value;
  }
  if (Array.isArray(value) && index >= -value.length && index < value.length) {
    return value[index];
  }
  return null;
}

function castValue(value: unknown, castAs: string | null): unknown {
  if (!castAs) {
    return value;
  }

  const key = castAs.trim().toLowerCase();
  if (["number", "int", "integer", "float"].includes(key)) {
    if (typeof value === "boolean") {
      return value;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (["str", "string"].includes(key)) {
    return String(value);
  }

  if (["bool", "boolean"].includes(key)) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const lower = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(lower)) {
        return true;
      }
      if (["false", "0", "no", "off"].includes(lower)) {
        return false;
      }
    }
    if (typeof value === "number") {
      return Boolean(value);
    }
    return null;
  }

  if (["array", "list"].includes(key)) {
    return Array.isArray(value) ? value : null;
  }

  if (["object", "json"].includes(key)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  return value;
}

export function resolveVariable(
  rawName: string,
  ops: VariableOps,
  scope: VariableScope | null = null,
  defaultValue: unknown = rawName,
): unknown {
  const [baseName, index, cast] = parseVariableExpression(rawName);
  if (!baseName) {
    return rawName;
  }

  let resolved: unknown;

  if (scope === "global") {
    if (!ops.globalVariableExists(baseName)) {
      return defaultValue;
    }
    resolved = ops.getGlobalVariable(baseName);
  } else if (scope === "room") {
    if (!ops.roomVariableExists(baseName)) {
      return defaultValue;
    }
    resolved = ops.getRoomVariable(baseName);
  } else if (ops.roomVariableExists(baseName)) {
    resolved = ops.getRoomVariable(baseName);
  } else if (ops.globalVariableExists(baseName)) {
    resolved = ops.getGlobalVariable(baseName);
  } else {
    return defaultValue;
  }

  const indexed = extractByIndex(resolved, index);
  if (indexed === null && index !== null) {
    return defaultValue;
  }

  const casted = castValue(indexed, cast);
  if (casted === null && cast) {
    return defaultValue;
  }

  return casted;
}

export function executeVariableCommand(content: string, ops: VariableOps): VariableCommandResult {
  const { op, args } = parseCommand(content);
  if (!op) {
    return { handled: false, output: "" };
  }

  const opMap: Record<string, [string, VariableScope]> = {
    getvar: ["get", "room"],
    setvar: ["set", "room"],
    addvar: ["add", "room"],
    incvar: ["inc", "room"],
    decvar: ["dec", "room"],
    listvar: ["list", "room"],
    flushvar: ["flush", "room"],
    getglobalvar: ["get", "global"],
    setglobalvar: ["set", "global"],
    addglobalvar: ["add", "global"],
    incglobalvar: ["inc", "global"],
    decglobalvar: ["dec", "global"],
    listglobalvar: ["list", "global"],
    flushglobalvar: ["flush", "global"],
  };

  const mapping = opMap[op];
  if (!mapping) {
    return { handled: false, output: "" };
  }

  const [action, mappedScope] = mapping;
  let scope: VariableScope = mappedScope;

  if (action === "list") {
    if (args.length > 0) {
      const scopeArg = (args[0] || "").toLowerCase();
      if (["global", "g", "globalvar"].includes(scopeArg)) {
        scope = "global";
      } else if (["room", "r", "local", "var"].includes(scopeArg)) {
        scope = "room";
      }
    }

    const values = scope === "global" ? ops.listGlobalVariables() : ops.listRoomVariables();
    return { handled: true, output: JSON.stringify(values) };
  }

  if (action === "flush") {
    const name = (args[0] || "").trim();
    if (!name) {
      return { handled: true, output: "变量名不能为空" };
    }

    if (scope === "global") {
      ops.deleteGlobalVariable(name);
      return { handled: true, output: `已清空全局变量: ${name}` };
    }

    ops.deleteRoomVariable(name);
    return { handled: true, output: `已清空变量: ${name}` };
  }

  const [name, rawValue] = extractNameAndValue(args);
  if (!name) {
    return { handled: true, output: "变量名不能为空" };
  }

  if (action === "get") {
    const value = resolveVariable(name, ops, scope, "");
    return { handled: true, output: formatVariableOutput(value) };
  }

  if (action === "set") {
    const value = parseVariableValue(rawValue);
    if (scope === "global") {
      ops.setGlobalVariable(name, value);
      return { handled: true, output: `已设置全局变量 ${name}` };
    }
    ops.setRoomVariable(name, value);
    return { handled: true, output: `已设置变量 ${name}` };
  }

  if (action === "add") {
    const value = parseVariableValue(rawValue);
    const next =
      scope === "global"
        ? ops.addGlobalVariable(name, value)
        : ops.addRoomVariable(name, value);
    return {
      handled: true,
      output: `变量 ${name} 已更新为 ${formatVariableOutput(next)}`,
    };
  }

  if (action === "inc" || action === "dec") {
    let delta: unknown = parseVariableValue(rawValue);
    if (!rawValue.trim()) {
      delta = 1;
    }

    if (typeof delta !== "number" || Number.isNaN(delta)) {
      return { handled: true, output: "增量必须是数字" };
    }

    const next =
      action === "inc"
        ? scope === "global"
          ? ops.incGlobalVariable(name, delta)
          : ops.incRoomVariable(name, delta)
        : scope === "global"
          ? ops.decGlobalVariable(name, delta)
          : ops.decRoomVariable(name, delta);

    return {
      handled: true,
      output: `变量 ${name} 已更新为 ${formatVariableOutput(next)}`,
    };
  }

  return { handled: true, output: "" };
}

export function renderVariableMacros(content: string, ops: VariableOps): string {
  if (!content.includes("{{")) {
    return content;
  }

  return content.replace(VAR_MACRO_RE, (fullMatch, expression: string) => {
    const parts = expression.split("::").map((part: string) => part.trim());
    if (parts.length === 0 || !parts[0]) {
      return "";
    }

    const command = parts[0].toLowerCase();

    if (command === "getvar" || command === "getglobalvar") {
      const nameExpr = parts.slice(1).join("::");
      const scope: VariableScope = command === "getglobalvar" ? "global" : "room";
      const value = resolveVariable(nameExpr, ops, scope, "");
      return formatVariableOutput(value);
    }

    if (
      ["setvar", "setglobalvar", "addvar", "addglobalvar", "incvar", "incglobalvar", "decvar", "decglobalvar"].includes(
        command,
      )
    ) {
      const scope: VariableScope = command.includes("global") ? "global" : "room";
      const name = parts[1] || "";
      if (!name) {
        return fullMatch;
      }

      const valueExpr = parts.slice(2).join("::");

      if (command === "setvar" || command === "setglobalvar") {
        const value = parseVariableValue(valueExpr);
        if (scope === "global") {
          ops.setGlobalVariable(name, value);
        } else {
          ops.setRoomVariable(name, value);
        }
        return "";
      }

      if (command === "addvar" || command === "addglobalvar") {
        const value = parseVariableValue(valueExpr);
        if (scope === "global") {
          ops.addGlobalVariable(name, value);
        } else {
          ops.addRoomVariable(name, value);
        }
        return "";
      }

      let delta: unknown = parseVariableValue(valueExpr);
      if (!valueExpr.trim()) {
        delta = 1;
      }
      if (typeof delta !== "number" || Number.isNaN(delta)) {
        return fullMatch;
      }

      if (command === "incvar" || command === "incglobalvar") {
        const next =
          scope === "global"
            ? ops.incGlobalVariable(name, delta)
            : ops.incRoomVariable(name, delta);
        return formatVariableOutput(next);
      }

      const next =
        scope === "global"
          ? ops.decGlobalVariable(name, delta)
          : ops.decRoomVariable(name, delta);
      return formatVariableOutput(next);
    }

    if (command === "flushvar" || command === "flushglobalvar") {
      const name = parts[1] || "";
      if (name) {
        if (command === "flushglobalvar") {
          ops.deleteGlobalVariable(name);
        } else {
          ops.deleteRoomVariable(name);
        }
      }
      return "";
    }

    return fullMatch;
  });
}

export function entriesToVariableRecord(entries: VariableEntry[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const entry of entries) {
    map[entry.name] = entry.value;
  }
  return map;
}
