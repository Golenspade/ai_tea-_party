import { z } from "zod";

import { VariableDisplaySchema } from "./variable-hud";

export const MessageSchema = z.object({
  id: z.string(),
  character_id: z.string(),
  character_name: z.string(),
  content: z.string(),
  timestamp: z.string(),
  is_system: z.boolean().optional().default(false),
  sender_type: z.enum(["ai", "user", "system"]).optional(),
  sender_user_id: z.string().optional(),
  sender_user_name: z.string().optional(),
});

export const MessagePatchSchema = z.object({
  room_id: z.string(),
  message_id: z.string(),
  content: z.string(),
  /** Pre-patch body so clients can render paragraph-level diff without local history. */
  previous_content: z.string().optional(),
  patched_at: z.string(),
  reason: z.string().optional(),
});

export const DmNextSpeakerSchema = z.object({
  room_id: z.string(),
  character_id: z.string(),
  character_name: z.string(),
  selected_at: z.string(),
  source: z.enum(["user", "dm"]),
  reason: z.string().optional(),
});

export const RoomSummarySchema = z.object({
  id: z.string(),
  room_id: z.string(),
  start_message_id: z.string(),
  end_message_id: z.string(),
  message_count: z.number().int(),
  summary: z.string(),
  source: z.enum(["llm", "deterministic"]),
  created_at: z.string(),
});

export const RoomArchiveManifestSchema = z.object({
  schema_version: z.number().int(),
  archive_id: z.string(),
  room_id: z.string(),
  title: z.string(),
  created_at: z.string(),
  message_count: z.number().int(),
  summary_count: z.number().int(),
  variable_count: z.number().int(),
  bar_version: z.number().int().optional(),
  world_info_book_ids: z.array(z.string()),
});

export const RoomArchiveRecordSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  title: z.string(),
  manifest: RoomArchiveManifestSchema,
  file_path: z.string().optional(),
  created_at: z.string(),
});

export const RoomCompactRangeSchema = z.object({
  start_message_id: z.string(),
  end_message_id: z.string(),
  message_count: z.number().int(),
});

export const RoomCompactResultSchema = z.object({
  room_id: z.string(),
  status: z.enum(["no_op", "dry_run", "committed"]),
  keep_recent: z.number().int(),
  range: RoomCompactRangeSchema.optional(),
  summary: RoomSummarySchema.optional(),
  reason: z.string().optional(),
});

export const PresenceUserSchema = z.object({
  user_id: z.string(),
  nickname: z.string(),
  room_id: z.string(),
  is_online: z.boolean(),
  joined_at: z.string(),
});

export const ExampleDialogueSchema = z.object({
  user_message: z.string(),
  character_response: z.string(),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  personality: z.string(),
  background: z.string(),
  speaking_style: z.string().optional(),
  description: z.string().optional(),
  scenario: z.string().optional(),
  system_prompt_override: z.string().optional(),
  post_instructions: z.string().optional(),
  greeting: z.string().optional(),
  creator_notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  example_dialogues: z.array(ExampleDialogueSchema).optional(),
  is_active: z.boolean().optional().default(true),
  avatar: z.string().optional(),
});

export const CharacterFormDataSchema = z.object({
  name: z.string(),
  personality: z.string(),
  background: z.string(),
  speaking_style: z.string(),
  description: z.string().optional(),
  scenario: z.string().optional(),
  system_prompt_override: z.string().optional(),
  post_instructions: z.string().optional(),
  greeting: z.string().optional(),
  creator_notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  example_dialogues: z.array(ExampleDialogueSchema).optional(),
});

export const PersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  is_default: z.boolean(),
});

export const WIPositionSchema = z.enum([
  "before_char",
  "after_char",
  "before_examples",
  "after_examples",
  "at_depth",
  "system_top",
  "system_bottom",
]);

export const VariableConditionSchema = z.object({
  scope: z.enum(["room", "global"]),
  name: z.string(),
  op: z.enum(["exists", "eq", "ne", "gt", "gte", "lt", "lte", "includes", "truthy"]),
  value: z.unknown().optional(),
});

export const VariableConditionLogicSchema = z.enum(["AND", "OR"]);

export const BehaviorRuleSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  conditions: z.array(VariableConditionSchema),
  condition_logic: VariableConditionLogicSchema,
  prompt_text: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ActiveBranchSchema = z.object({
  id: z.string(),
  type: z.enum(["world_info", "behavior_rule"]),
  name: z.string(),
  source: z.string().optional(),
  content: z.string(),
  priority: z.number().int().optional(),
});

export const WorldInfoEntrySchema = z.object({
  id: z.string(),
  keys: z.array(z.string()),
  secondary_keys: z.array(z.string()),
  selective_logic: z.string(),
  content: z.string(),
  position: WIPositionSchema,
  depth: z.number().int(),
  enabled: z.boolean(),
  constant: z.boolean(),
  order: z.number().int(),
  conditions: z.array(VariableConditionSchema).optional(),
  condition_logic: VariableConditionLogicSchema.optional(),
});

export const WorldInfoBookSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  entries: z.array(WorldInfoEntrySchema),
});

export const ChatRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  characters: z.array(CharacterSchema),
  messages: z.array(MessageSchema),
  is_auto_chat: z.boolean(),
  max_history: z.number().int(),
  created_at: z.string(),
  stealth_mode: z.boolean(),
  user_description: z.string(),
});

export const ProviderDefSchema = z.object({
  name: z.string(),
  prefix: z.string(),
  env_key: z.string(),
  models: z.array(z.string()),
  default: z.string(),
  context_tokens: z.number().int(),
  description: z.string(),
  custom_model: z.boolean().optional(),
  needs_api_base: z.boolean().optional(),
  default_api_base: z.string().optional(),
});

export const StreamingEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("delta"),
    content: z.string(),
    message_id: z.string().optional(),
    character_id: z.string().optional(),
    character_name: z.string().optional(),
    request_id: z.string().optional(),
  }),
  z.object({
    type: z.literal("final"),
    content: z.string(),
    request_id: z.string(),
    message_id: z.string().optional(),
    character_id: z.string().optional(),
    character_name: z.string().optional(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    message_id: z.string().optional(),
    character_id: z.string().optional(),
    request_id: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_call_start"),
    request_id: z.string(),
    tool: z.string(),
    args: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("tool_call_update"),
    request_id: z.string(),
    tool: z.string(),
    progress: z.union([z.string(), z.number()]),
  }),
  z.object({
    type: z.literal("tool_call_end"),
    request_id: z.string(),
    tool: z.string(),
    output: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("room_message"),
    request_id: z.string(),
    message: MessageSchema,
  }),
  z.object({
    type: z.literal("message_patch"),
    request_id: z.string(),
    patch: MessagePatchSchema,
  }),
  z.object({
    type: z.literal("bar_update"),
    request_id: z.string(),
    room_id: z.string(),
    content: z.string(),
    label: z.string(),
    version: z.number().int(),
  }),
  z.object({
    type: z.literal("ask_pending"),
    request_id: z.string(),
    ask_id: z.string(),
    question: z.string(),
    choices: z.array(z.string()),
    allow_custom: z.boolean().optional(),
    multiple: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("awaiting_user"),
    request_id: z.string(),
    ask_id: z.string(),
  }),
]);

export const RoomBarSnapshotSchema = z.object({
  room_id: z.string(),
  content: z.string(),
  label: z.string(),
  version: z.number().int(),
  updated_at: z.string(),
});

export const AskAnswerSchema = z.object({
  selected: z.array(z.string()).optional(),
  custom: z.string().optional(),
});

export const PendingAskSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  request_id: z.string(),
  character_id: z.string(),
  tool_call_id: z.string(),
  question: z.string(),
  choices: z.array(z.string()),
  allow_custom: z.boolean(),
  multiple: z.boolean(),
  status: z.enum(["pending", "resolved", "expired"]),
  answer: AskAnswerSchema.optional(),
  agent_messages_json: z.string().optional(),
  system_prompt: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  created_at: z.string(),
  resolved_at: z.string().optional(),
});

export const RoomArchiveSchema = z.object({
  manifest: RoomArchiveManifestSchema,
  room: ChatRoomSchema,
  messages: z.array(MessageSchema),
  summaries: z.array(RoomSummarySchema),
  room_variables: z.array(z.object({
    name: z.string(),
    value: z.unknown(),
    scope: z.literal("room"),
  })),
  global_variables: z.array(z.object({
    name: z.string(),
    value: z.unknown(),
    scope: z.literal("global"),
  })),
  room_bar: RoomBarSnapshotSchema.nullable(),
  world_info_books: z.array(WorldInfoBookSchema),
  behavior_rules: z.array(BehaviorRuleSchema).optional().default([]),
  variable_displays: z.array(VariableDisplaySchema).optional().default([]),
});

export const WsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    data: MessageSchema,
  }),
  z.object({
    type: z.literal("message_patch"),
    patch: MessagePatchSchema,
  }),
  z.object({
    type: z.literal("dm_next_speaker"),
    choice: DmNextSpeakerSchema,
  }),
  z.object({
    type: z.literal("character_update"),
    action: z.string(),
    character: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("room_status"),
    data: z.object({ is_auto_chat: z.boolean().optional() }),
  }),
  z.object({
    type: z.literal("presence"),
    room_id: z.string(),
    users: z.array(PresenceUserSchema),
  }),
  z.object({
    type: z.literal("bar_update"),
    room_id: z.string(),
    content: z.string(),
    label: z.string(),
    version: z.number().int(),
  }),
  z.object({
    type: z.literal("ask_pending"),
    ask: PendingAskSchema.pick({
      id: true,
      room_id: true,
      request_id: true,
      character_id: true,
      question: true,
      choices: true,
      allow_custom: true,
      multiple: true,
      status: true,
      created_at: true,
    }),
  }),
  z.object({
    type: z.literal("ask_resolved"),
    ask_id: z.string(),
    answer: AskAnswerSchema,
  }),
  z.object({
    type: z.literal("variable_update"),
    room_id: z.string(),
    scope: z.enum(["room", "global"]),
    name: z.string(),
    value: z.unknown(),
    previous_value: z.unknown().optional(),
    delta: z.number().optional(),
    op: z.enum(["set", "inc", "dec", "add", "delete"]),
  }),
]);

export const VariableUpdateOpSchema = z.enum(["set", "inc", "dec", "add", "delete"]);

export const VariableUpdatePayloadSchema = z.object({
  type: z.literal("variable_update"),
  room_id: z.string(),
  scope: z.enum(["room", "global"]),
  name: z.string(),
  value: z.unknown(),
  previous_value: z.unknown().optional(),
  delta: z.number().optional(),
  op: VariableUpdateOpSchema,
});

export type ExampleDialogue = z.infer<typeof ExampleDialogueSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type CharacterFormData = z.infer<typeof CharacterFormDataSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type MessagePatch = z.infer<typeof MessagePatchSchema>;
export type DmNextSpeaker = z.infer<typeof DmNextSpeakerSchema>;
export type RoomSummary = z.infer<typeof RoomSummarySchema>;
export type RoomArchiveManifest = z.infer<typeof RoomArchiveManifestSchema>;
export type RoomArchiveRecord = z.infer<typeof RoomArchiveRecordSchema>;
export type RoomCompactRange = z.infer<typeof RoomCompactRangeSchema>;
export type RoomCompactResult = z.infer<typeof RoomCompactResultSchema>;
export type PresenceUser = z.infer<typeof PresenceUserSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type VariableCondition = z.infer<typeof VariableConditionSchema>;
export type VariableConditionLogic = z.infer<typeof VariableConditionLogicSchema>;
export type BehaviorRule = z.infer<typeof BehaviorRuleSchema>;
export type ActiveBranch = z.infer<typeof ActiveBranchSchema>;
export type WorldInfoEntry = z.infer<typeof WorldInfoEntrySchema>;
export type WorldInfoBook = z.infer<typeof WorldInfoBookSchema>;
export type ChatRoom = z.infer<typeof ChatRoomSchema>;
export type ProviderDef = z.infer<typeof ProviderDefSchema>;
export type VariableScope = "room" | "global";
export type VariableEntry = {
  name: string;
  value: unknown;
  scope: VariableScope;
};

export type VariableSetRequest = {
  name: string;
  value: unknown;
};

export type VariablePatchRequest = {
  name: string;
  value: unknown;
};

export type StreamingEvent = z.infer<typeof StreamingEventSchema>;
export type WsMessage = z.infer<typeof WsMessageSchema>;
export type VariableUpdateOp = z.infer<typeof VariableUpdateOpSchema>;
export type VariableUpdatePayload = z.infer<typeof VariableUpdatePayloadSchema>;
export type RoomBarSnapshot = z.infer<typeof RoomBarSnapshotSchema>;
export type AskAnswer = z.infer<typeof AskAnswerSchema>;
export type PendingAsk = z.infer<typeof PendingAskSchema>;
export type RoomArchive = z.infer<typeof RoomArchiveSchema>;

export {
  VariablePolaritySchema,
  VariableDisplaySchema,
  ResolvedVariableDisplaySchema,
  VariableHudResponseSchema,
  normalizeRatio,
  inferVariableDisplay,
  resolveHudDisplays,
  parseVariableDisplaysJson,
} from "./variable-hud";

export type {
  VariablePolarity,
  VariableDisplay,
  ResolvedVariableDisplay,
  VariableHudResponse,
  VariableEntryLike,
} from "./variable-hud";
