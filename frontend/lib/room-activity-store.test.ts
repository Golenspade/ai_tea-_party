import { beforeEach, describe, expect, it } from "vitest";

import {
  createEmptyRoomActivityRecord,
  deriveRoomActivityStatus,
  EMPTY_ROOM_ACTIVITY_RECORD,
  useRoomActivityStore,
} from "./room-activity-store";

describe("room-activity-store", () => {
  beforeEach(() => {
    useRoomActivityStore.setState({ records: {} });
  });

  it("starts in thinking on startRun", () => {
    useRoomActivityStore.getState().startRun("default", {
      characterId: "c1",
      characterName: "小明",
    });

    const record = useRoomActivityStore.getState().getRecord("default");
    expect(record.runActive).toBe(true);
    expect(record.status).toBe("thinking");
    expect(record.characterName).toBe("小明");
  });

  it("moves to acting when tool args are ready", () => {
    const store = useRoomActivityStore.getState();
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    store.setTool("default", "write_to_room", { content: "一段旁白" });

    const record = store.getRecord("default");
    expect(record.status).toBe("acting");
    expect(record.currentToolLabel).toContain("正在写入房间");
  });

  it("defers tool label for empty args", () => {
    const store = useRoomActivityStore.getState();
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    store.setTool("default", "write_to_room", {});

    const record = store.getRecord("default");
    expect(record.currentTool).toBe("write_to_room");
    expect(record.currentToolLabel).toBeNull();
    expect(record.status).toBe("thinking");
  });

  it("returns to idle on endRun", () => {
    const store = useRoomActivityStore.getState();
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    store.endRun("default");

    const record = store.getRecord("default");
    expect(record).toBe(EMPTY_ROOM_ACTIVITY_RECORD);
    expect(record.runActive).toBe(false);
    expect(record.status).toBe("idle");
  });

  it("derives streaming after visible output", () => {
    const record = {
      ...createEmptyRoomActivityRecord(),
      runActive: true,
      hasVisibleOutput: true,
    };
    expect(deriveRoomActivityStatus(record)).toBe("streaming");
  });

  it("promotes deferred tool label from progress updates", () => {
    const store = useRoomActivityStore.getState();
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    store.setTool("default", "write_to_room", {});
    expect(store.getRecord("default").currentToolLabel).toBeNull();

    store.setToolProgress("default", "write_to_room", "众人行至破庙门前");
    const record = store.getRecord("default");
    expect(record.status).toBe("acting");
    expect(record.currentToolLabel).toContain("众人行至破庙门前");
  });

  it("keeps completed tool steps for footer hints", () => {
    const store = useRoomActivityStore.getState();
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    store.setTool("default", "write_to_bar", { content: "雨势渐大" });
    store.clearTool("default");

    const record = store.getRecord("default");
    expect(record.toolSteps).toHaveLength(1);
    expect(record.toolSteps[0]?.label).toContain("形势");
    expect(record.toolSteps[0]?.endedAt).toBeTypeOf("number");
  });

  it("clears sticky error before a new run", () => {
    const store = useRoomActivityStore.getState();
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    store.setError("default", "生成失败");
    expect(store.getRecord("default").status).toBe("error");

    store.clearError("default");
    store.startRun("default", { characterId: "c1", characterName: "小明" });
    expect(store.getRecord("default").status).toBe("thinking");
    expect(store.getRecord("default").errorMessage).toBeNull();
  });
});
