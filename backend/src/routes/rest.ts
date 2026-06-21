import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";

import { appState } from "../store";
import type { RoomSocketManager } from "../room-hub";
import type {
  Character,
  CharacterFormData,
  Message,
  Persona,
  VariableEntry,
  WorldInfoBook,
  WorldInfoEntry,
  AskAnswer,
  VariableCondition,
  VariableConditionLogic,
  BehaviorRule,
} from "@ai-party/shared";
import { parseWriteToRoomInput } from "../services/write-to-room";
import { pendingAskToPublic, validateAskAnswer } from "../services/ask-user";
import {
  normalizeConditionLogic,
  normalizeVariableConditions,
} from "../services/variable-conditions";

type ResponseLength = "short" | "default" | "long";

type ApiConfigPayload = {
  provider: string;
  api_key: string;
  model?: string;
  api_base?: string;
};

interface RoomIdParams {
  room_id: string;
}

interface ArchiveIdParams {
  archive_id: string;
}

interface CharacterIdParams {
  character_id: string;
}

type NextSpeakerParams = RoomIdParams & CharacterIdParams;

interface NameParams {
  name: string;
}

interface GenericQuery {
  limit?: string | number;
  since?: string;
}

interface MessageRequestBody {
  character_id: string;
  content: string;
  sender_type?: "ai" | "user" | "system";
  sender_user_id?: string;
  sender_user_name?: string;
}

const HUMAN_BROADCAST_ID = "__human_room_broadcast__";

type CharacterRequestBody = CharacterFormData & {
  avatar?: string;
};

interface VariableSetRequest {
  name: string;
  value: unknown;
}

interface VariableOpRequest {
  name: string;
  value?: unknown;
}

interface SettingsRequest {
  response_length: ResponseLength;
}

interface RoomSettings {
  name?: string;
  description?: string;
  stealth_mode?: boolean;
  user_description?: string;
}

interface RoomCreatePayload {
  name: string;
  description?: string;
  stealth_mode?: boolean;
  user_description?: string;
}

interface WorldInfoBookPayload {
  name: string;
  description?: string;
  enabled?: boolean;
}

interface WorldInfoEntryPayload {
  keys: string[];
  secondary_keys?: string[];
  selective_logic?: string;
  content: string;
  position?: string;
  depth?: number;
  enabled?: boolean;
  constant?: boolean;
  order?: number;
  conditions?: VariableCondition[];
  condition_logic?: VariableConditionLogic;
}

interface RoomWorldInfoPayload {
  book_ids: string[];
}

interface BehaviorRulePayload {
  name?: string;
  enabled?: boolean;
  priority?: number;
  conditions?: VariableCondition[];
  condition_logic?: VariableConditionLogic;
  prompt_text?: string;
}

interface ArchiveCreatePayload {
  title?: string;
}

interface CompactPayload {
  mode?: "dry_run" | "commit";
  keep_recent?: number;
  target_messages?: number;
}

interface PersonaPayload {
  name: string;
  description?: string;
  is_default?: boolean;
}

const DEFAULT_ROOM_ID = "default";

const nowIso = () => new Date().toISOString();

function parseLimit(raw: unknown, fallback = 50): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 1;
  return Math.min(Math.floor(n), 200);
}

function parseResponseLength(value: string): ResponseLength | undefined {
  if (value === "short" || value === "default" || value === "long") {
    return value;
  }

  return undefined;
}

function buildCharacterFromBody(roomId: string, body: CharacterRequestBody): Character {
  const data = body || ({} as CharacterRequestBody);

  if (!data.name?.trim()) {
    throw new Error("角色名称不能为空");
  }

  return {
    id: randomUUID(),
    name: data.name,
    personality: data.personality || "",
    background: data.background || "",
    description: data.description || "",
    scenario: data.scenario || "",
    speaking_style: data.speaking_style || "",
    system_prompt_override: data.system_prompt_override || "",
    post_instructions: data.post_instructions || "",
    greeting: data.greeting || "",
    creator_notes: data.creator_notes || "",
    tags: data.tags || [],
    is_active: true,
    example_dialogues: data.example_dialogues || [],
    avatar: data.avatar,
  };
}

function sendFailure(reply: FastifyReply, code: number, detail: string): void {
  void reply.code(code).send({ detail });
}

function normalizeWorldPosition(raw: string | undefined): WorldInfoEntry["position"] {
  const allowed: Array<WorldInfoEntry["position"]> = [
    "before_char",
    "after_char",
    "before_examples",
    "after_examples",
    "at_depth",
    "system_top",
    "system_bottom",
  ];

  return allowed.includes(raw as WorldInfoEntry["position"]) ? (raw as WorldInfoEntry["position"]) : "after_char";
}

function parseSince(raw?: string): { iso?: string; error?: string } {
  if (!raw) {
    return {};
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "since 参数格式无效" };
  }

  return { iso: trimmed };
}

function hasValue(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function getTrimmedVariableName(name: string): string {
  return name.trim();
}

export function registerRestRoutes(
  app: FastifyInstance,
  { socketManager: _socketManager }: { socketManager: RoomSocketManager },
): void {
  const socketManager = _socketManager;

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/characters", async (request, reply) => {
    const room = appState.getRoom(request.params.room_id);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return room.characters.map((character) => ({
      id: character.id,
      name: character.name,
      personality: character.personality,
      background: character.background,
      speaking_style: character.speaking_style,
      is_active: character.is_active,
      description: character.description,
      scenario: character.scenario,
    }));
  });

  app.post<{ Body: CharacterRequestBody }>("/api/characters", async (request, reply) => {
    try {
      const character = buildCharacterFromBody(DEFAULT_ROOM_ID, request.body);
      const created = appState.addCharacterToRoom(DEFAULT_ROOM_ID, character);
      await socketManager.broadcastCharacterUpdate(DEFAULT_ROOM_ID, "added", {
        id: created.id,
        name: created.name,
        personality: created.personality,
        background: created.background,
        speaking_style: created.speaking_style,
        is_active: created.is_active,
        description: created.description,
        scenario: created.scenario,
      });
      return created;
    } catch (error) {
      return sendFailure(
        reply,
        400,
        error instanceof Error ? error.message : "创建角色失败",
      );
    }
  });

  app.post<{ Params: RoomIdParams; Body: CharacterRequestBody }>(
    "/api/rooms/:room_id/characters",
    async (request, reply) => {
      try {
        const character = appState.addCharacterToRoom(request.params.room_id, buildCharacterFromBody(request.params.room_id, request.body));
        await socketManager.broadcastCharacterUpdate(request.params.room_id, "added", {
          id: character.id,
          name: character.name,
          personality: character.personality,
          background: character.background,
          speaking_style: character.speaking_style,
          is_active: character.is_active,
          description: character.description,
          scenario: character.scenario,
        });
        return {
          message: "角色添加成功",
          character_id: character.id,
        };
      } catch (error) {
        return sendFailure(
          reply,
          404,
          error instanceof Error ? error.message : "添加角色失败",
        );
      }
    },
  );

  app.delete<{ Params: RoomIdParams & CharacterIdParams }>(
    "/api/rooms/:room_id/characters/:character_id",
    async (request, reply) => {
      const { room_id, character_id } = request.params;
      const removed = appState.removeCharacterFromRoom(room_id, character_id);
      if (!removed) {
        return sendFailure(reply, 404, "聊天室或角色不存在");
      }

      await socketManager.broadcastCharacterUpdate(room_id, "removed", { id: removed.id, name: removed.name });
      return { message: "角色移除成功" };
    },
  );

  app.get<{ Params: RoomIdParams; Querystring: GenericQuery }>("/api/rooms/:room_id/messages", async (request, reply) => {
    const room = appState.getRoom(request.params.room_id);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    const parsedSince = parseSince(request.query.since);
    if (parsedSince.error) {
      return sendFailure(reply, 400, parsedSince.error);
    }

    const messages = appState.getMessagesSince(
      request.params.room_id,
      parsedSince.iso,
      parseLimit(request.query.limit),
    );
    return messages;
  });

  app.post<{ Params: RoomIdParams; Body: MessageRequestBody }>(
    "/api/rooms/:room_id/messages",
    async (request, reply) => {
      const roomId = request.params.room_id;
      const {
        character_id,
        content,
        sender_type,
        sender_user_id,
        sender_user_name,
      } = request.body;
      const room = appState.getRoom(roomId);
      if (!room || !character_id) {
        return sendFailure(reply, 404, "聊天室或角色不存在");
      }

      const isHumanBroadcast = character_id === HUMAN_BROADCAST_ID;
      let resolvedCharacterId = character_id;
      let characterName = "";

      if (isHumanBroadcast) {
        resolvedCharacterId = HUMAN_BROADCAST_ID;
        characterName = sender_user_name?.trim() || "人类用户";
      } else {
        const character = room.characters.find((item) => item.id === character_id);
        if (!character) {
          return sendFailure(reply, 404, "聊天室或角色不存在");
        }
        characterName = character.name;
      }

      const outgoingMessages = appState.buildOutgoingMessages(
        roomId,
        resolvedCharacterId,
        characterName,
        content || "",
        {
          sender_type: sender_type || "user",
          sender_user_id: sender_user_id || "user",
          sender_user_name,
        },
      );

      for (const message of outgoingMessages) {
        appState.addRoomMessage(roomId, message);
        await socketManager.broadcastMessage(roomId, message);
      }

      return { message: "消息发送成功" };
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/presence", (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    const users = socketManager.getPresence(roomId);

    return {
      room_id: roomId,
      users,
      count: users.length,
    };
  });

  app.delete<{ Params: RoomIdParams }>(
    "/api/rooms/:room_id/messages",
    async (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      appState.clearRoomMessages(roomId);

      const systemMessage: Message = {
        id: randomUUID(),
        character_id: "system",
        character_name: "系统",
        content: "聊天记录已清空",
        timestamp: nowIso(),
        is_system: true,
      };
      appState.addRoomMessage(roomId, systemMessage);
      await socketManager.broadcastMessage(roomId, systemMessage);

      return { message: "聊天记录已清空" };
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/summaries", (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return {
      room_id: roomId,
      summaries: appState.listRoomSummaries(roomId),
    };
  });

  app.post<{ Params: RoomIdParams; Body: CompactPayload }>(
    "/api/rooms/:room_id/compact",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      try {
        return appState.compactRoom(roomId, {
          mode: request.body?.mode === "commit" ? "commit" : "dry_run",
          keep_recent: request.body?.keep_recent,
          target_messages: request.body?.target_messages,
        });
      } catch (error) {
        return sendFailure(
          reply,
          400,
          error instanceof Error ? error.message : "压缩失败",
        );
      }
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/archives", (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return {
      room_id: roomId,
      archives: appState.listRoomArchives(roomId),
    };
  });

  app.post<{ Params: RoomIdParams; Body: ArchiveCreatePayload }>(
    "/api/rooms/:room_id/archives",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      try {
        const archive = appState.createRoomArchive(roomId, request.body?.title);
        return {
          status: "success",
          archive,
        };
      } catch (error) {
        return sendFailure(
          reply,
          400,
          error instanceof Error ? error.message : "创建归档失败",
        );
      }
    },
  );

  app.get<{ Params: RoomIdParams & ArchiveIdParams }>(
    "/api/rooms/:room_id/archives/:archive_id",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      try {
        const archive = appState.getRoomArchive(roomId, request.params.archive_id);
        if (!archive) {
          return sendFailure(reply, 404, "归档不存在");
        }
        return archive;
      } catch (error) {
        return sendFailure(
          reply,
          404,
          error instanceof Error ? error.message : "归档不存在",
        );
      }
    },
  );

  // 变量管理
  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/variables", (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return {
      scope: "room",
      room_id: roomId,
      variables: appState.listRoomVariables(roomId),
    };
  });

  app.post<{ Params: RoomIdParams; Body: VariableSetRequest }>(
    "/api/rooms/:room_id/variables",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const variableName = getTrimmedVariableName(request.body.name);
      const existing = appState.listRoomVariables(roomId).find((item) => item.name === variableName);
      if (existing) {
        return sendFailure(reply, 409, "变量名已存在");
      }

      const result = appState.setVariable("room", roomId, variableName, request.body.value);
      return {
        scope: "room",
        room_id: roomId,
        name: result.name,
        value: result.value,
      };
    },
  );

  app.post<{ Params: RoomIdParams; Body: VariableSetRequest }>(
    "/api/rooms/:room_id/variables/set",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const result = appState.setVariable("room", roomId, getTrimmedVariableName(request.body.name), request.body.value);
      return {
        scope: "room",
        room_id: roomId,
        name: result.name,
        value: result.value,
      };
    },
  );

  app.post<{ Params: RoomIdParams; Body: VariableOpRequest }>(
    "/api/rooms/:room_id/variables/add",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const result = appState.addVariable("room", roomId, getTrimmedVariableName(request.body.name), request.body.value ?? 1);
      return {
        scope: "room",
        room_id: roomId,
        name: result.name,
        value: result.value,
      };
    },
  );

  app.post<{ Params: RoomIdParams; Body: VariableOpRequest }>(
    "/api/rooms/:room_id/variables/inc",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const result = appState.incVariable("room", roomId, getTrimmedVariableName(request.body.name), request.body.value ?? 1);
      return {
        scope: "room",
        room_id: roomId,
        name: result.name,
        value: result.value,
      };
    },
  );

  app.post<{ Params: RoomIdParams; Body: VariableOpRequest }>(
    "/api/rooms/:room_id/variables/dec",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const result = appState.decVariable("room", roomId, getTrimmedVariableName(request.body.name), request.body.value ?? 1);
      return {
        scope: "room",
        room_id: roomId,
        name: result.name,
        value: result.value,
      };
    },
  );

  app.delete<{ Params: RoomIdParams & NameParams }>(
    "/api/rooms/:room_id/variables/:name",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.params.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const variableName = getTrimmedVariableName(request.params.name);
      const deleted = appState.deleteVariable("room", roomId, variableName);
      if (!deleted) {
        return sendFailure(reply, 404, "变量不存在");
      }

      return {
        scope: "room",
        room_id: roomId,
        name: variableName,
        deleted,
      };
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/behavior-rules", (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return {
      room_id: roomId,
      rules: appState.listBehaviorRules(roomId),
    };
  });

  app.post<{ Params: RoomIdParams; Body: BehaviorRulePayload }>(
    "/api/rooms/:room_id/behavior-rules",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "规则名称不能为空");
      }

      if (!hasValue(request.body?.prompt_text)) {
        return sendFailure(reply, 400, "规则内容不能为空");
      }

      const rule = appState.upsertBehaviorRule(roomId, {
        name: request.body.name.trim(),
        enabled: request.body.enabled !== false,
        priority: request.body.priority ?? 100,
        conditions: normalizeVariableConditions(request.body.conditions),
        condition_logic: normalizeConditionLogic(request.body.condition_logic),
        prompt_text: request.body.prompt_text.trim(),
      });

      return {
        status: "success",
        rule,
      };
    },
  );

  app.put<{ Params: RoomIdParams & { rule_id: string }; Body: BehaviorRulePayload }>(
    "/api/rooms/:room_id/behavior-rules/:rule_id",
    (request, reply) => {
      const roomId = request.params.room_id;
      const existing = appState
        .listBehaviorRules(roomId)
        .find((rule) => rule.id === request.params.rule_id);
      if (!existing) {
        return sendFailure(reply, 404, "行为规则不存在");
      }

      const updated: BehaviorRule = {
        ...existing,
        name: request.body.name?.trim() || existing.name,
        enabled: request.body.enabled ?? existing.enabled,
        priority: request.body.priority ?? existing.priority,
        conditions: request.body.conditions !== undefined
          ? normalizeVariableConditions(request.body.conditions)
          : existing.conditions,
        condition_logic: request.body.condition_logic !== undefined
          ? normalizeConditionLogic(request.body.condition_logic)
          : existing.condition_logic,
        prompt_text: request.body.prompt_text?.trim() || existing.prompt_text,
      };

      const rule = appState.upsertBehaviorRule(roomId, updated);
      return {
        status: "success",
        rule,
      };
    },
  );

  app.delete<{ Params: RoomIdParams & { rule_id: string } }>(
    "/api/rooms/:room_id/behavior-rules/:rule_id",
    (request, reply) => {
      const roomId = request.params.room_id;
      const deleted = appState.deleteBehaviorRule(roomId, request.params.rule_id);
      if (!deleted) {
        return sendFailure(reply, 404, "行为规则不存在");
      }

      return { status: "success" };
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/branches/active", (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return {
      room_id: roomId,
      branches: appState.listActiveBranches(roomId),
    };
  });

  app.get("/api/variables/global", () => ({
    scope: "global",
    variables: appState.listGlobalVariables(),
  }));

  app.post<{ Params: { op: string }; Body: VariableOpRequest }>(
    "/api/variables/global/:op",
    (request, reply) => {
      const op = request.params.op;
      if (!hasValue(request.body?.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      let result: VariableEntry;
      if (op === "set") {
        result = appState.setVariable("global", "global", getTrimmedVariableName(request.body.name), request.body.value);
      } else if (op === "add") {
        result = appState.addVariable("global", "global", getTrimmedVariableName(request.body.name), request.body.value ?? 1);
      } else if (op === "inc") {
        result = appState.incVariable("global", "global", getTrimmedVariableName(request.body.name), request.body.value ?? 1);
      } else if (op === "dec") {
        result = appState.decVariable("global", "global", getTrimmedVariableName(request.body.name), request.body.value ?? 1);
      } else {
        return sendFailure(reply, 400, "不支持的操作类型");
      }

      return result;
    },
  );

  app.delete<{ Params: { name: string } }>(
    "/api/variables/global/:name",
    (request, reply) => {
      if (!hasValue(request.params.name)) {
        return sendFailure(reply, 400, "变量名不能为空");
      }

      const variableName = getTrimmedVariableName(request.params.name);
      const deleted = appState.deleteVariable("global", "global", variableName);
      if (!deleted) {
        return sendFailure(reply, 404, "变量不存在");
      }

      return {
        scope: "global",
        name: variableName,
        deleted,
      };
    },
  );

  // 自动聊天
  app.post<{ Params: RoomIdParams }>("/api/rooms/:room_id/auto-chat/start", async (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    const hasTimer = appState.autoChatTimers.get(roomId);
    if (hasTimer) {
      clearInterval(hasTimer);
    }

    appState.setRoomAutoChat(roomId, true);
    const intervalMs = Math.max(Number(process.env.AUTO_CHAT_INTERVAL || "5"), 1) * 1000;

    const runAutoChatTick = async (): Promise<void> => {
      const targetRoom = appState.getRoom(roomId);
      if (!targetRoom || !appState.getRoomAutoChat(roomId) || targetRoom.characters.length === 0) {
        return;
      }

      const choice = appState.chooseNextSpeaker(roomId);
      const character = choice
        ? targetRoom.characters.find((item) => item.id === choice.character_id)
        : undefined;
      if (!choice || !character) {
        return;
      }

      try {
        await socketManager.broadcastDmNextSpeaker(roomId, choice);
        const { message } = await appState.generateAiReply(roomId, character.id, {
          onRoomMessage: async (roomMessage) => {
            await socketManager.broadcastMessage(roomId, roomMessage);
          },
          onMessagePatch: async (patch) => {
            await socketManager.broadcastMessagePatch(roomId, patch);
          },
          onBarUpdate: async (snapshot) => {
            await socketManager.broadcastBarUpdate(roomId, {
              content: snapshot.content,
              label: snapshot.label,
              version: snapshot.version,
            });
          },
          onAskPending: async (ask) => {
            await socketManager.broadcastAskPending(roomId, pendingAskToPublic(ask));
          },
        });
        if (message) {
          await socketManager.broadcastMessage(roomId, message);
        }
      } catch (error) {
        request.log.warn({ err: error, roomId }, "auto-chat tick failed");
      }
    };

    void runAutoChatTick();
    const timer = setInterval(() => {
      void runAutoChatTick();
    }, intervalMs);

    appState.autoChatTimers.set(roomId, timer);
    await socketManager.broadcastRoomStatus(roomId, { is_auto_chat: true });
    return { message: "自动聊天已开始" };
  });

  app.post<{ Params: NextSpeakerParams }>(
    "/api/rooms/:room_id/dm/next-speaker/:character_id",
    async (request, reply) => {
      try {
        const choice = appState.designateNextSpeaker(
          request.params.room_id,
          request.params.character_id,
        );
        await socketManager.broadcastDmNextSpeaker(request.params.room_id, choice);
        return {
          status: "success",
          choice,
        };
      } catch (error) {
        return sendFailure(
          reply,
          error instanceof Error && error.message.includes("聊天室") ? 404 : 400,
          error instanceof Error ? error.message : "指定失败",
        );
      }
    },
  );

  app.post<{ Params: RoomIdParams }>("/api/rooms/:room_id/auto-chat/stop", async (request, reply) => {
    const roomId = request.params.room_id;
    const room = appState.getRoom(roomId);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    const timer = appState.autoChatTimers.get(roomId);
    if (timer) {
      clearInterval(timer);
      appState.autoChatTimers.delete(roomId);
    }

    appState.setRoomAutoChat(roomId, false);
    await socketManager.broadcastRoomStatus(roomId, { is_auto_chat: false });
    return { message: "自动聊天已停止" };
  });

  app.get("/api/health", () => {
    const rooms = appState.cloneRoomsSnapshot();
    let roomsOnline = 0;
    let connections = 0;

    for (const room of rooms) {
      const roomConnections = socketManager.count(room.id);
      if (roomConnections > 0) {
        roomsOnline += 1;
      }
      connections += roomConnections;
    }

    return {
      status: "healthy",
      ai_configured: true,
      rooms: rooms.length,
      rooms_online: roomsOnline,
      connections,
    };
  });

  app.get("/api/providers", () => ({
    providers: appState.getProviderDefs(),
  }));

  app.get("/api/config", () => ({
    current_config: appState.getConfig(),
    providers: appState.getProviderDefs(),
  }));

  app.post<{ Body: ApiConfigPayload }>("/api/config", (request, reply) => {
    if (!appState.getProviderDefs()[request.body.provider]) {
      return sendFailure(reply, 400, "不支持的 Provider");
    }

    appState.setConfig({
      provider: request.body.provider,
      model: request.body.model,
    });

    return {
      message: "API配置更新成功",
      provider: request.body.provider,
      model: appState.getConfig().model,
      config: appState.getConfig(),
      test_result: appState.testConnection(),
    };
  });

  app.post("/api/test-connection", () => appState.testConnection());

  app.get("/api/status", () => {
    const current = appState.getConfig();
    return {
      status: current ? "configured" : "not_configured",
      provider: current.provider,
      model: current.model,
    };
  });

  app.get("/api/settings", () => ({ response_length: appState.responseLength }));

  app.post<{ Body: SettingsRequest }>("/api/settings", (request, reply) => {
    const next = parseResponseLength(request.body.response_length);
    if (!next) {
      return sendFailure(reply, 400, "无效的回复长度设置");
    }

    appState.setResponseLength(next);
    return {
      message: "设置已更新",
      response_length: appState.responseLength,
    };
  });

  // 房间
  app.post<{ Body: RoomCreatePayload }>("/api/rooms", async (request) => {
    const room = appState.createRoom(request.body.name || "新聊天室", request.body.description, {
      stealth_mode: request.body.stealth_mode,
      user_description: request.body.user_description,
      created_at: nowIso(),
    });

    return {
      status: "success",
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        stealth_mode: room.stealth_mode,
        user_description: room.user_description,
        character_count: room.characters.length,
        created_at: room.created_at,
      },
    };
  });

  app.get("/api/rooms", () => ({
    status: "success",
    rooms: appState.cloneRoomsSnapshot().map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      stealth_mode: room.stealth_mode,
      user_description: room.user_description,
      character_count: room.characters.length,
      message_count: room.messages.length,
      is_auto_chat: room.is_auto_chat,
      created_at: room.created_at,
      characters: room.characters.map((character) => ({
        id: character.id,
        name: character.name,
        personality: character.personality,
        is_active: character.is_active,
      })),
    })),
  }));

  app.put<{ Params: RoomIdParams; Body: RoomSettings }>("/api/rooms/:room_id", (request, reply) => {
    const updated = appState.setRoomStealthMode(
      request.params.room_id,
      request.body.stealth_mode,
      request.body.user_description,
      request.body.name,
      request.body.description,
    );

    if (!updated) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return {
      status: "success",
      message: "聊天室设置已更新",
    };
  });

  // Persona 管理
  app.get("/api/personas", () =>
    appState.listPersonas().map((persona: Persona) => ({
      id: persona.id,
      name: persona.name,
      description: persona.description,
      is_default: persona.is_default,
    })),
  );

  app.post<{ Body: PersonaPayload }>("/api/personas", (request) => {
    const normalized: Persona = {
      id: randomUUID(),
      name: request.body.name,
      description: request.body.description || "",
      is_default: Boolean(request.body.is_default),
    };

    const persona = appState.savePersona(normalized);
    return {
      status: "success",
      persona,
    };
  });

  app.put<{ Params: { persona_id: string }; Body: PersonaPayload }>(
    "/api/personas/:persona_id",
    (request, reply) => {
      const list = appState.listPersonas();
      const exists = list.some((persona) => persona.id === request.params.persona_id);
      if (!exists) {
        return sendFailure(reply, 404, "用户画像不存在");
      }

      const updated: Persona = {
        id: request.params.persona_id,
        name: request.body.name,
        description: request.body.description || "",
        is_default: Boolean(request.body.is_default),
      };

      const persona = appState.savePersona(updated);
      return {
        status: "success",
        persona,
      };
    },
  );

  app.delete<{ Params: { persona_id: string } }>("/api/personas/:persona_id", (request) => {
    appState.deletePersona(request.params.persona_id);
    return { status: "success" };
  });

  // World Info
  app.get("/api/world-info", () => appState.listWorldInfoBooks());

  app.post<{ Body: WorldInfoBookPayload }>("/api/world-info", (request, reply) => {
    if (!request.body.name?.trim()) {
      return sendFailure(reply, 400, "书籍名称不能为空");
    }

    const book = appState.createWorldInfoBook(
      request.body.name,
      request.body.description || "",
      request.body.enabled !== false,
    );

    return {
      status: "success",
      book,
    };
  });

  app.put<{ Params: NameParams; Body: WorldInfoBookPayload }>(
    "/api/world-info/:name",
    (request, reply) => {
      const existing = appState.listWorldInfoBooks().find((book) => book.id === request.params.name);
      if (!existing) {
        return sendFailure(reply, 404, "知识库不存在");
      }

      const normalized: WorldInfoBook = {
        ...existing,
        id: request.params.name,
        name: request.body.name,
        description: request.body.description || existing.description,
        enabled: request.body.enabled ?? existing.enabled,
      };

      const saved = appState.saveWorldInfoBook(normalized);
      return {
        status: "success",
        book: saved,
      };
    },
  );

  app.delete<{ Params: NameParams }>("/api/world-info/:name", (request, reply) => {
    const existed = appState.listWorldInfoBooks().some((book) => book.id === request.params.name);
    if (!existed) {
      return sendFailure(reply, 404, "知识库不存在");
    }

    appState.deleteWorldInfoBook(request.params.name);
    return { status: "success" };
  });

  app.get<{ Params: NameParams }>("/api/world-info/:name/entries", (request, reply) => {
    const book = appState.listWorldInfoBooks().find((item) => item.id === request.params.name);
    if (!book) {
      return sendFailure(reply, 404, "知识库不存在");
    }

    return book.entries;
  });

  app.post<{ Params: NameParams; Body: WorldInfoEntryPayload }>(
    "/api/world-info/:name/entries",
    (request, reply) => {
      const book = appState.listWorldInfoBooks().find((item) => item.id === request.params.name);
      if (!book) {
        return sendFailure(reply, 404, "知识库不存在");
      }

      if (!Array.isArray(request.body?.keys) || request.body.keys.length === 0) {
        return sendFailure(reply, 400, "entry keys 不能为空");
      }

      const entry: WorldInfoEntry = {
        id: randomUUID(),
        keys: request.body.keys || [],
        secondary_keys: request.body.secondary_keys || [],
        selective_logic: request.body.selective_logic || "AND",
        content: request.body.content || "",
        position: normalizeWorldPosition(request.body.position),
        depth: request.body.depth || 4,
        enabled: request.body.enabled !== false,
        constant: Boolean(request.body.constant),
        order: request.body.order ?? 100,
        conditions: normalizeVariableConditions(request.body.conditions),
        condition_logic: normalizeConditionLogic(request.body.condition_logic),
      };

      const saved = appState.upsertWorldInfoEntry(book.id, entry);
      return {
        status: "success",
        entry: saved,
      };
    },
  );

  app.put<{ Params: { name: string; entry_id: string }; Body: WorldInfoEntryPayload }>(
    "/api/world-info/:name/entries/:entry_id",
    (request, reply) => {
      const book = appState.listWorldInfoBooks().find((item) => item.id === request.params.name);
      if (!book) {
        return sendFailure(reply, 404, "知识库不存在");
      }

      const exists = book.entries.some((entry) => entry.id === request.params.entry_id);
      if (!exists) {
        return sendFailure(reply, 404, "词条不存在");
      }

      const entry: WorldInfoEntry = {
        id: request.params.entry_id,
        keys: request.body.keys || [],
        secondary_keys: request.body.secondary_keys || [],
        selective_logic: request.body.selective_logic || "AND",
        content: request.body.content || "",
        position: normalizeWorldPosition(request.body.position),
        depth: request.body.depth || 4,
        enabled: request.body.enabled !== false,
        constant: Boolean(request.body.constant),
        order: request.body.order ?? 100,
        conditions: normalizeVariableConditions(request.body.conditions),
        condition_logic: normalizeConditionLogic(request.body.condition_logic),
      };

      const saved = appState.upsertWorldInfoEntry(book.id, entry);
      return {
        status: "success",
        entry: saved,
      };
    },
  );

  app.delete<{ Params: { name: string; entry_id: string } }>(
    "/api/world-info/:name/entries/:entry_id",
    (request, reply) => {
      const book = appState.listWorldInfoBooks().find((item) => item.id === request.params.name);
      if (!book) {
        return sendFailure(reply, 404, "知识库不存在");
      }

      const removed = appState.deleteWorldInfoEntry(request.params.name, request.params.entry_id);
      if (!removed) {
        return sendFailure(reply, 404, "词条不存在");
      }

      return { status: "success" };
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/world-info", (request, reply) => {
    const room = appState.getRoom(request.params.room_id);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    return appState.getRoomWorldInfo(request.params.room_id);
  });

  app.put<{ Params: RoomIdParams; Body: RoomWorldInfoPayload }>(
    "/api/rooms/:room_id/world-info",
    (request, reply) => {
      const roomId = request.params.room_id;
      const room = appState.getRoom(roomId);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      const bookIds = request.body?.book_ids || [];
      appState.setRoomWorldInfo(roomId, bookIds);
      return { status: "success" };
    },
  );

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/bar", (request, reply) => {
    const room = appState.getRoom(request.params.room_id);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    const bar = appState.getRoomBar(request.params.room_id);
    return bar ?? {
      room_id: request.params.room_id,
      content: "",
      label: "当前形势",
      version: 0,
      updated_at: new Date(0).toISOString(),
    };
  });

  app.get<{ Params: RoomIdParams }>("/api/rooms/:room_id/asks/pending", (request, reply) => {
    const room = appState.getRoom(request.params.room_id);
    if (!room) {
      return sendFailure(reply, 404, "聊天室不存在");
    }

    const pending = appState.getRoomPendingAsk(request.params.room_id);
    return {
      ask: pending ? pendingAskToPublic(pending) : null,
    };
  });

  app.post<{ Params: RoomIdParams & { ask_id: string }; Body: AskAnswer }>(
    "/api/rooms/:room_id/asks/:ask_id/answer",
    async (request, reply) => {
      const roomId = request.params.room_id;
      const askId = request.params.ask_id;
      const pending = appState.getPendingAsk(askId);

      if (!pending || pending.room_id !== roomId) {
        return sendFailure(reply, 404, "Ask 不存在");
      }

      if (pending.status !== "pending") {
        return sendFailure(reply, 400, "Ask 已处理");
      }

      const answer: AskAnswer = {
        selected: request.body?.selected,
        custom: request.body?.custom,
      };

      try {
        validateAskAnswer(pending, answer);
      } catch (error) {
        return sendFailure(
          reply,
          400,
          error instanceof Error ? error.message : "回答无效",
        );
      }

      const resolved = appState.answerPendingAsk(askId, answer);
      if (!resolved) {
        return sendFailure(reply, 400, "无法处理 Ask");
      }

      await socketManager.broadcastAskResolved(roomId, askId, answer);
      return { status: "success", ask: pendingAskToPublic(resolved) };
    },
  );

  if (process.env.NODE_ENV !== "production") {
  app.post<{ Params: RoomIdParams; Body: { content: string; character_id?: string; sender_type?: "ai" | "user" | "system" } }>(
    "/api/rooms/:room_id/agent/write-to-room",
    async (request, reply) => {
      const room = appState.getRoom(request.params.room_id);
      if (!room) {
        return sendFailure(reply, 404, "聊天室不存在");
      }

      try {
        const input = parseWriteToRoomInput(request.body as Record<string, unknown>);
        const characterId = request.body?.character_id || room.characters[0]?.id;
        const character = room.characters.find((item) => item.id === characterId);
        if (!character) {
          return sendFailure(reply, 404, "角色不存在");
        }

        const message = appState.writeAgentRoomMessage(request.params.room_id, character, input);
        await socketManager.broadcastMessage(request.params.room_id, message);
        return { status: "success", message };
      } catch (error) {
        return sendFailure(
          reply,
          400,
          error instanceof Error ? error.message : "写入失败",
        );
      }
    },
  );
  }
}
