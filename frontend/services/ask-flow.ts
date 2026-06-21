import type { AskAnswer } from "@/lib/types";
import { answerPendingAsk, streamAIResponseResume } from "@/services/api";

export interface AskResumeClient {
  answerPendingAsk: (
    askId: string,
    answer: AskAnswer,
    roomId?: string,
  ) => Promise<void>;
  streamAIResponseResume: (askId: string, roomId?: string) => Promise<Response>;
}

const defaultClient: AskResumeClient = {
  answerPendingAsk,
  streamAIResponseResume,
};

export async function submitAskAndStartResume(
  askId: string,
  answer: AskAnswer,
  roomId = "default",
  client: AskResumeClient = defaultClient,
  onAnswered?: () => void,
): Promise<Response> {
  await client.answerPendingAsk(askId, answer, roomId);
  onAnswered?.();
  return client.streamAIResponseResume(askId, roomId);
}
