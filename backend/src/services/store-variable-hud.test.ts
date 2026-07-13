import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { appState } from "../store.js";

describe("variable HUD API state", () => {
  const names = {
    danger: `hud_danger_${process.pid}`,
    mood: `hud_mood_${process.pid}`,
  };

  afterEach(() => {
    try {
      appState.deleteVariable("room", "default", names.danger);
      appState.deleteVariable("room", "default", names.mood);
      appState.setRoomVariableDisplays("default", []);
    } catch {
      // ignore cleanup errors
    }
  });

  it("getVariableHud merges explicit displays with inferred numerics", () => {
    appState.setVariable("room", "default", names.danger, 8);
    appState.setVariable("room", "default", names.mood, 3);
    appState.setRoomVariableDisplays("default", [
      {
        name: names.danger,
        label: "危险",
        min: 0,
        max: 50,
        polarity: "higher_is_worse",
        order: 1,
      },
    ]);

    const hud = appState.getVariableHud("default");
    const danger = hud.displays.find((item) => item.name === names.danger);
    const mood = hud.displays.find((item) => item.name === names.mood);

    assert.ok(danger);
    assert.equal(danger?.label, "危险");
    assert.equal(danger?.max, 50);
    assert.equal(danger?.source, "explicit");
    assert.equal(hud.values[names.danger], 8);

    assert.ok(mood);
    assert.equal(mood?.source, "inferred");
    assert.equal(mood?.label, names.mood);
  });

  it("honors show_in_hud false exclusion", () => {
    appState.setVariable("room", "default", names.danger, 9);
    appState.setRoomVariableDisplays("default", [
      { name: names.danger, show_in_hud: false },
    ]);

    const hud = appState.getVariableHud("default");
    assert.equal(
      hud.displays.find((item) => item.name === names.danger),
      undefined,
    );
  });
});
