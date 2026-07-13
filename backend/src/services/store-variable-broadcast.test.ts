import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { VariableUpdatePayload } from "@ai-party/shared";

import { appState } from "../store.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("store variable broadcast", () => {
  afterEach(() => {
    appState.setVariableChangeNotifier(async () => undefined);
    try {
      appState.deleteVariable("room", "default", "danger");
    } catch {
      // ignore
    }
  });

  it("emits variable_update on room inc", async () => {
    const events: VariableUpdatePayload[] = [];
    appState.setVariableChangeNotifier((payload) => {
      events.push(payload);
    });

    appState.setVariable("room", "default", "danger", 2);
    appState.incVariable("room", "default", "danger", 3);
    await wait(20);

    assert.ok(events.length >= 2);
    const last = events.at(-1)!;
    assert.deepEqual(
      {
        type: last.type,
        room_id: last.room_id,
        scope: last.scope,
        name: last.name,
        op: last.op,
        value: last.value,
        previous_value: last.previous_value,
        delta: last.delta,
      },
      {
        type: "variable_update",
        room_id: "default",
        scope: "room",
        name: "danger",
        op: "inc",
        value: 5,
        previous_value: 2,
        delta: 3,
      },
    );
  });

  it("does not emit on no-op inc", async () => {
    const events: VariableUpdatePayload[] = [];
    appState.setVariableChangeNotifier((payload) => {
      events.push(payload);
    });

    appState.setVariable("room", "default", "danger", 4);
    await wait(10);
    events.length = 0;

    // Invalid delta keeps value unchanged → no broadcast (review lock).
    appState.incVariable("room", "default", "danger", "not-a-number");
    await wait(30);
    assert.equal(events.length, 0);
  });
});
