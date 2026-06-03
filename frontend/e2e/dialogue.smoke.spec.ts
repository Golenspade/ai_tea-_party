import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";

interface RoomMessage {
  id: string;
  character_id: string;
  character_name: string;
  content: string;
  sender_type?: string;
  is_system?: boolean;
}

async function fetchAiMessages(request: import("@playwright/test").APIRequestContext): Promise<RoomMessage[]> {
  const response = await request.get(`${E2E_API_BASE_URL}/api/rooms/default/messages`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { messages?: RoomMessage[] } | RoomMessage[];
  const messages = Array.isArray(payload) ? payload : payload.messages || [];
  return messages.filter(
    (message) =>
      !message.is_system &&
      message.sender_type === "ai" &&
      message.content.trim().length > 0,
  );
}

test.describe("AI 对话连通性", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });
  });

  test("单轮：点击 Speak 后收到 AI 回复", async ({ page, request }) => {
    const baseline = (await fetchAiMessages(request)).length;

    const characterRow = page.getByText(/^I\. /).first();
    await characterRow.hover();
    await page.getByRole("button", { name: "Speak" }).first().click();

    await expect
      .poll(async () => (await fetchAiMessages(request)).length, {
        timeout: 120_000,
      })
      .toBeGreaterThan(baseline);

    const latest = (await fetchAiMessages(request)).at(-1);
    expect(latest?.content.trim().length || 0).toBeGreaterThan(3);
  });

  test("Top 5：自动对话至少产生 5 条 AI 消息", async ({ page, request }) => {
    const baseline = (await fetchAiMessages(request)).length;

    await page.getByRole("button", { name: "Commence Auto-Dialogue" }).click();
    await expect(page.getByText("[Auto-Dialogue]")).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => (await fetchAiMessages(request)).length - baseline, {
        timeout: 150_000,
      })
      .toBeGreaterThanOrEqual(5);

    await page.getByRole("button", { name: "Halt Dialogue" }).click();
    await expect(page.getByText("[Auto-Dialogue]")).toHaveCount(0, { timeout: 10_000 });
  });
});
