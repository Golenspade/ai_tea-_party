import { useMemo } from "react";

import { EMPTY_ROOM_ACTIVITY_RECORD, useRoomActivityStore } from "@/lib/room-activity-store";

export const DEFAULT_ROOM_ID = "default";

export function useRoomActivity(roomId = DEFAULT_ROOM_ID) {
  return useRoomActivityStore(
    (state) => state.records[roomId] ?? EMPTY_ROOM_ACTIVITY_RECORD,
  );
}

export function useRoomActivityActions(roomId = DEFAULT_ROOM_ID) {
  const startRun = useRoomActivityStore((state) => state.startRun);
  const setTool = useRoomActivityStore((state) => state.setTool);
  const setToolProgress = useRoomActivityStore((state) => state.setToolProgress);
  const clearTool = useRoomActivityStore((state) => state.clearTool);
  const markVisibleOutput = useRoomActivityStore((state) => state.markVisibleOutput);
  const setAwaitingUser = useRoomActivityStore((state) => state.setAwaitingUser);
  const setError = useRoomActivityStore((state) => state.setError);
  const clearError = useRoomActivityStore((state) => state.clearError);
  const endRun = useRoomActivityStore((state) => state.endRun);
  const reset = useRoomActivityStore((state) => state.reset);

  return useMemo(
    () => ({
      startRun: (input: { requestId?: string; characterId: string; characterName: string }) =>
        startRun(roomId, input),
      setTool: (tool: string, args: Record<string, unknown>) => setTool(roomId, tool, args),
      setToolProgress: (tool: string, progress: string | number) =>
        setToolProgress(roomId, tool, progress),
      clearTool: () => clearTool(roomId),
      markVisibleOutput: () => markVisibleOutput(roomId),
      setAwaitingUser: () => setAwaitingUser(roomId),
      setError: (message: string) => setError(roomId, message),
      clearError: () => clearError(roomId),
      endRun: () => endRun(roomId),
      reset: () => reset(roomId),
    }),
    [
      roomId,
      startRun,
      setTool,
      setToolProgress,
      clearTool,
      markVisibleOutput,
      setAwaitingUser,
      setError,
      clearError,
      endRun,
      reset,
    ],
  );
}
