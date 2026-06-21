import type { Message, MessagePatch } from "@/lib/types";

export function applyMessagePatch(messages: Message[], patch: MessagePatch): Message[] {
  return messages.map((message) =>
    message.id === patch.message_id
      ? { ...message, content: patch.content }
      : message,
  );
}
