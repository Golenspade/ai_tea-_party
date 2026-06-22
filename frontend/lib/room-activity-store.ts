import { create } from "zustand";

import { getToolActivityLabel, shouldDeferToolLabel } from "./tool-activity";

export type RoomActivityStatus =
  | "idle"
  | "thinking"
  | "acting"
  | "streaming"
  | "awaiting_user"
  | "error";

export type RoomActivityToolStep = {
  tool: string;
  label: string;
  startedAt: number;
  endedAt?: number;
  summary?: string;
};

export type RoomActivityRecord = {
  status: RoomActivityStatus;
  requestId: string | null;
  characterId: string | null;
  characterName: string | null;
  runActive: boolean;
  hasVisibleOutput: boolean;
  currentTool: string | null;
  currentToolLabel: string | null;
  toolStartedAt: number | null;
  errorMessage: string | null;
  toolSteps: RoomActivityToolStep[];
  updatedAt: number;
};

export function createEmptyRoomActivityRecord(): RoomActivityRecord {
  return {
    status: "idle",
    requestId: null,
    characterId: null,
    characterName: null,
    runActive: false,
    hasVisibleOutput: false,
    currentTool: null,
    currentToolLabel: null,
    toolStartedAt: null,
    errorMessage: null,
    toolSteps: [],
    updatedAt: Date.now(),
  };
}

/** Stable idle snapshot for selectors — must not allocate per render. */
export const EMPTY_ROOM_ACTIVITY_RECORD: RoomActivityRecord = {
  status: "idle",
  requestId: null,
  characterId: null,
  characterName: null,
  runActive: false,
  hasVisibleOutput: false,
  currentTool: null,
  currentToolLabel: null,
  toolStartedAt: null,
  errorMessage: null,
  toolSteps: [],
  updatedAt: 0,
};

export function deriveRoomActivityStatus(record: RoomActivityRecord): RoomActivityStatus {
  if (record.errorMessage) return "error";
  if (!record.runActive) return "idle";
  if (record.status === "awaiting_user") return "awaiting_user";
  if (record.currentTool && record.currentToolLabel) return "acting";
  if (record.hasVisibleOutput) return "streaming";
  return "thinking";
}

function withDerivedStatus(record: RoomActivityRecord): RoomActivityRecord {
  return {
    ...record,
    status: deriveRoomActivityStatus(record),
    updatedAt: Date.now(),
  };
}

export interface RoomActivityStore {
  records: Record<string, RoomActivityRecord>;
  getRecord: (roomId: string) => RoomActivityRecord;
  startRun: (
    roomId: string,
    input: { requestId?: string; characterId: string; characterName: string },
  ) => void;
  setTool: (roomId: string, tool: string, args: Record<string, unknown>) => void;
  clearTool: (roomId: string) => void;
  markVisibleOutput: (roomId: string) => void;
  setAwaitingUser: (roomId: string) => void;
  setError: (roomId: string, message: string) => void;
  endRun: (roomId: string) => void;
  reset: (roomId: string) => void;
}

export const useRoomActivityStore = create<RoomActivityStore>((set, get) => ({
  records: {},

  getRecord: (roomId) => get().records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD,

  startRun: (roomId, input) =>
    set((state) => ({
      records: {
        ...state.records,
        [roomId]: withDerivedStatus({
          ...createEmptyRoomActivityRecord(),
          status: "thinking",
          runActive: true,
          requestId: input.requestId ?? null,
          characterId: input.characterId,
          characterName: input.characterName,
        }),
      },
    })),

  setTool: (roomId, tool, args) =>
    set((state) => {
      const prev = state.records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD;
      if (shouldDeferToolLabel(tool, args)) {
        return {
          records: {
            ...state.records,
            [roomId]: withDerivedStatus({
              ...prev,
              currentTool: tool,
            }),
          },
        };
      }

      const label = getToolActivityLabel(tool, args);
      return {
        records: {
          ...state.records,
          [roomId]: withDerivedStatus({
            ...prev,
            currentTool: tool,
            currentToolLabel: label,
            toolStartedAt: prev.toolStartedAt ?? Date.now(),
          }),
        },
      };
    }),

  clearTool: (roomId) =>
    set((state) => {
      const prev = state.records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD;
      const step: RoomActivityToolStep | null =
        prev.currentTool && prev.toolStartedAt
          ? {
              tool: prev.currentTool,
              label: prev.currentToolLabel || prev.currentTool,
              startedAt: prev.toolStartedAt,
              endedAt: Date.now(),
            }
          : null;

      return {
        records: {
          ...state.records,
          [roomId]: withDerivedStatus({
            ...prev,
            currentTool: null,
            currentToolLabel: null,
            toolStartedAt: null,
            toolSteps: step ? [...prev.toolSteps, step] : prev.toolSteps,
          }),
        },
      };
    }),

  markVisibleOutput: (roomId) =>
    set((state) => {
      const prev = state.records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD;
      if (prev.hasVisibleOutput) {
        return state;
      }
      return {
        records: {
          ...state.records,
          [roomId]: withDerivedStatus({
            ...prev,
            hasVisibleOutput: true,
          }),
        },
      };
    }),

  setAwaitingUser: (roomId) =>
    set((state) => {
      const prev = state.records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD;
      return {
        records: {
          ...state.records,
          [roomId]: withDerivedStatus({
            ...prev,
            status: "awaiting_user",
            runActive: false,
            currentTool: null,
            currentToolLabel: null,
            toolStartedAt: null,
            errorMessage: null,
          }),
        },
      };
    }),

  setError: (roomId, message) =>
    set((state) => {
      const prev = state.records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD;
      return {
        records: {
          ...state.records,
          [roomId]: withDerivedStatus({
            ...prev,
            runActive: false,
            errorMessage: message,
            currentTool: null,
            currentToolLabel: null,
            toolStartedAt: null,
          }),
        },
      };
    }),

  endRun: (roomId) =>
    set((state) => {
      if (!(roomId in state.records)) {
        return state;
      }
      const { [roomId]: _removed, ...records } = state.records;
      return { records };
    }),

  reset: (roomId) =>
    set((state) => {
      if (!(roomId in state.records)) {
        return state;
      }
      const { [roomId]: _removed, ...records } = state.records;
      return { records };
    }),
}));
