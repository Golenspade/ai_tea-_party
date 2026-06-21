import type {
  VariableCondition,
  VariableConditionLogic,
} from "@ai-party/shared";

export interface VariableConditionContext {
  room: Record<string, unknown>;
  global: Record<string, unknown>;
}

const VALID_OPS = new Set<VariableCondition["op"]>([
  "exists",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "includes",
  "truthy",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, name);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (isRecord(left) || isRecord(right) || Array.isArray(left) || Array.isArray(right)) {
    return stableStringify(left) === stableStringify(right);
  }

  return Object.is(left, right);
}

function getConditionValue(
  condition: VariableCondition,
  context: VariableConditionContext,
): { exists: boolean; value: unknown } {
  const scope = condition.scope === "global" ? context.global : context.room;
  return {
    exists: hasOwn(scope, condition.name),
    value: scope[condition.name],
  };
}

export function normalizeConditionLogic(raw: unknown): VariableConditionLogic {
  return raw === "OR" ? "OR" : "AND";
}

export function normalizeVariableCondition(raw: unknown): VariableCondition | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    return undefined;
  }

  const rawOp = typeof raw.op === "string" ? raw.op : "exists";
  const op = VALID_OPS.has(rawOp as VariableCondition["op"])
    ? (rawOp as VariableCondition["op"])
    : "exists";

  const condition: VariableCondition = {
    scope: raw.scope === "global" ? "global" : "room",
    name,
    op,
  };

  if ("value" in raw) {
    condition.value = raw.value;
  }

  return condition;
}

export function normalizeVariableConditions(raw: unknown): VariableCondition[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => normalizeVariableCondition(item))
    .filter((item): item is VariableCondition => Boolean(item));
}

export function evaluateVariableCondition(
  condition: VariableCondition,
  context: VariableConditionContext,
): boolean {
  const { exists, value } = getConditionValue(condition, context);

  if (condition.op === "exists") {
    return exists;
  }

  if (!exists) {
    return false;
  }

  switch (condition.op) {
    case "truthy":
      return Boolean(value);
    case "eq":
      return valuesEqual(value, condition.value);
    case "ne":
      return !valuesEqual(value, condition.value);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = toFiniteNumber(value);
      const right = toFiniteNumber(condition.value);
      if (left === undefined || right === undefined) {
        return false;
      }
      if (condition.op === "gt") return left > right;
      if (condition.op === "gte") return left >= right;
      if (condition.op === "lt") return left < right;
      return left <= right;
    }
    case "includes":
      if (typeof value === "string") {
        if (
          typeof condition.value !== "string"
          && typeof condition.value !== "number"
          && typeof condition.value !== "boolean"
        ) {
          return false;
        }
        return value.includes(String(condition.value));
      }
      if (Array.isArray(value)) {
        return value.some((item) => valuesEqual(item, condition.value));
      }
      return false;
    default:
      return false;
  }
}

export function evaluateVariableConditions(
  conditions: VariableCondition[] | undefined,
  logic: VariableConditionLogic | undefined,
  context: VariableConditionContext,
): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  if (logic === "OR") {
    return conditions.some((condition) => evaluateVariableCondition(condition, context));
  }

  return conditions.every((condition) => evaluateVariableCondition(condition, context));
}
