import type { VariableUpdateOp, VariableUpdatePayload } from "@ai-party/shared";

/** Spec §3.3 — delta only when both sides are finite numbers. */
export function computeDelta(previous: unknown, next: unknown): number | undefined {
  if (typeof previous !== "number" || typeof next !== "number") return undefined;
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return undefined;
  return next - previous;
}

export function buildVariableUpdatePayload(input: {
  roomId: string;
  scope: "room" | "global";
  name: string;
  op: VariableUpdateOp;
  value: unknown;
  previousValue?: unknown;
}): VariableUpdatePayload {
  const delta = computeDelta(input.previousValue, input.value);
  return {
    type: "variable_update",
    room_id: input.roomId,
    scope: input.scope,
    name: input.name,
    op: input.op,
    value: input.value,
    ...(input.previousValue !== undefined ? { previous_value: input.previousValue } : {}),
    ...(delta !== undefined ? { delta } : {}),
  };
}

/** Review: no-op changes must not broadcast. */
export function isNoOpVariableChange(
  previousValue: unknown,
  nextValue: unknown,
): boolean {
  return Object.is(previousValue, nextValue);
}
