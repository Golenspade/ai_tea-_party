import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";
import { assertBackendHealthy, hasLiveLlmCredentials } from "./helpers/live";

interface RoomMessage {
  id: string;
  character_id: string;
  character_name: string;
  content: string;
  timestamp?: string;
  sender_type?: string;
  is_system?: boolean;
}

function isAiMessage(message: RoomMessage): boolean {
  return (
    !message.is_system &&
    message.sender_type === "ai" &&
    message.content.trim().length > 0
  );
}

async function fetchRoomMessages(
  request: import("@playwright/test").APIRequestContext,
  options?: { since?: string; limit?: number },
): Promise<RoomMessage[]> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 100));
  if (options?.since) {
    params.set("since", options.since);
  }

  const response = await request.get(
    `${E2E_API_BASE_URL}/api/rooms/default/messages?${params.toString()}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { messages?: RoomMessage[] } | RoomMessage[];
  const messages = Array.isArray(payload) ? payload : payload.messages || [];
  return messages;
}

async function fetchAiMessages(
  request: import("@playwright/test").APIRequestContext,
  options?: { since?: string; limit?: number },
): Promise<RoomMessage[]> {
  const messages = await fetchRoomMessages(request, options);
  return messages.filter(isAiMessage);
}

async function fetchLatestMessageTimestamp(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  const messages = await fetchRoomMessages(request, { limit: 1 });
  return messages.at(-1)?.timestamp ?? new Date(0).toISOString();
}

test.describe("AI 对话连通性", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page, request }) => {
    test.skip(
      !hasLiveLlmCredentials(),
      "需要真实 LLM API Key（DEEPSEEK_API_KEY / GEMINI_API_KEY 等）",
    );
    await assertBackendHealthy(request);
    await page.goto("/");
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });
  });

  test("单轮：点击 Speak 后收到 AI 回复", async ({ page, request }) => {
    const since = await fetchLatestMessageTimestamp(request);

    const characterRow = page.getByText(/^I\. /).first();
    await characterRow.hover();
    await page.getByRole("button", { name: "Speak" }).first().click();

    await expect
      .poll(async () => (await fetchAiMessages(request, { since, limit: 50 })).length, {
        timeout: 120_000,
      })
      .toBeGreaterThan(0);

    const latest = (await fetchAiMessages(request, { since, limit: 50 })).at(-1);
    expect(latest?.content.trim().length || 0).toBeGreaterThan(3);
  });

  test("Top 5：自动对话至少产生 5 条 AI 消息", async ({ page, request }) => {
    const since = await fetchLatestMessageTimestamp(request);

    await page.getByRole("button", { name: "Commence Auto-Dialogue" }).click();
    await expect(page.getByText("[Auto-Dialogue]")).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => (await fetchAiMessages(request, { since, limit: 100 })).length, {
        timeout: 150_000,
      })
      .toBeGreaterThanOrEqual(5);

    await page.getByRole("button", { name: "Halt Dialogue" }).click();
    await expect(page.getByText("[Auto-Dialogue]")).toHaveCount(0, { timeout: 10_000 });
  });
});
