import { z } from "zod";

export const MessageSchema = z.object({
  id: z.string(),
  character_id: z.string(),
  character_name: z.string(),
  content: z.string(),
  timestamp: z.string(),
  is_system: z.boolean().optional().default(false),
  sender_type: z.enum(["ai", "user", "system"]).optional(),
  sender_user_id: z.string().optional(),
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
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    message_id: z.string().optional(),
    character_id: z.string().optional(),
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
]);

export const WsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    data: MessageSchema,
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
    users: z.array(z.object({
      user_id: z.string(),
      nickname: z.string(),
      room_id: z.string(),
      is_online: z.boolean(),
      joined_at: z.string(),
    })),
  }),
]);

export type ExampleDialogue = z.infer<typeof ExampleDialogueSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type CharacterFormData = z.infer<typeof CharacterFormDataSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
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
