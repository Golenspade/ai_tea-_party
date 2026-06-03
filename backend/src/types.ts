export type ResponseLength = "short" | "default" | "long";

export interface PresenceUser {
  user_id: string;
  nickname: string;
  room_id: string;
  is_online: boolean;
  joined_at: string;
}

export interface GenerateRequestBody {
  character_id: string;
}

export interface AutoChatPayload {
  message: string;
}
