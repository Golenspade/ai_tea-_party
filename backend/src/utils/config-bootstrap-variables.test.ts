import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { CharacterFormData, VariableDisplay } from "@ai-party/shared";

import { bootstrapRoomsFromConfig } from "./config-bootstrap.js";

describe("config bootstrap variables", () => {
  it("seeds room_variables, global_variables, and variable_displays", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ai-party-bootstrap-vars-"));
    const configPath = join(tempDir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        rooms: [
          {
            id: "seed-room",
            name: "Seed Room",
            room_variables: [{ name: "danger", value: 3, scope: "room" }],
            global_variables: [{ name: "chapter", value: 1, scope: "global" }],
            variable_displays: [
              {
                name: "danger",
                label: "危险",
                min: 0,
                max: 50,
                polarity: "higher_is_worse",
              },
            ],
          },
        ],
      }),
      "utf8",
    );

    try {
      const rooms = new Set<string>();
      const roomVars: Array<{ name: string; value: unknown }> = [];
      const globalVars: Array<{ name: string; value: unknown }> = [];
      let displays: VariableDisplay[] = [];

      bootstrapRoomsFromConfig(
        {
          getRoom: (roomId) => (rooms.has(roomId) ? { id: roomId } : null),
          createRoom: (_name, _description, options) => {
            rooms.add(options.id);
          },
          addCharacterToRoom: (_roomId, _data: CharacterFormData) => undefined,
          setVariable: (scope, _roomId, name, value) => {
            if (scope === "global") {
              globalVars.push({ name, value });
            } else {
              roomVars.push({ name, value });
            }
          },
          setRoomVariableDisplays: (_roomId, next) => {
            displays = next;
          },
        },
        configPath,
      );

      assert.deepEqual(roomVars, [{ name: "danger", value: 3 }]);
      assert.deepEqual(globalVars, [{ name: "chapter", value: 1 }]);
      assert.equal(displays[0]?.label, "危险");
      assert.equal(displays[0]?.max, 50);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
