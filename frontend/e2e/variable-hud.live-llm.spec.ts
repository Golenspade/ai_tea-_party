import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";
import {
  assertBackendHealthy,
  hasLiveLlmCredentials,
  waitForConnected,
} from "./helpers/live";

interface RoomMessage {
  id: string;
  character_id: string;
  character_name: string;
  content: string;
  timestamp?: string;
  sender_type?: string;
  is_system?: boolean;
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
  return Array.isArray(payload) ? payload : payload.messages || [];
}

/**
 * 真实 LLM → Agent tool → Variable HUD 闭环。
 * 需要环境变量中配置 DEEPSEEK_API_KEY / GEMINI_API_KEY 等，并重启 backend 加载 .env。
 */
test.describe("Variable HUD live LLM", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ request }) => {
    test.skip(!hasLiveLlmCredentials(), "需要真实 LLM API Key（如 DEEPSEEK_API_KEY）");
    await assertBackendHealthy(request);
  });

  test("Speak 后 Agent 可通过工具改值并反映到 HUD", async ({ page, request }) => {
    await waitForConnected(page);

    const marker = `llm_hud_${Date.now()}`;
    const set = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/set`, {
      data: { name: marker, value: 1 },
    });
    expect(set.ok()).toBeTruthy();

    // 确保 HUD 先出现该变量
    await page.reload();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`variable-hud-${marker}`)).toContainText("1", {
      timeout: 15_000,
    });

    const before = await fetchRoomMessages(request, { limit: 1 });
    const since = before.at(-1)?.timestamp ?? new Date(0).toISOString();

    // 通过用户消息提示 Agent 使用 inc_variable（具体是否调用取决于模型）
    const composer = page.getByPlaceholder("Type your inquiry here...");
    await composer.fill(
      `系统指令：请立刻调用工具 inc_variable，将房间变量 ${marker} 增加 7。不要解释，先改变量。`,
    );
    await page.getByRole("button", { name: "Submit" }).click();

    // 若自动发言未触发角色，再点 Speak
    const characterRow = page.getByText(/^I\. /).first();
    await characterRow.hover();
    await page.getByRole("button", { name: "Speak" }).first().click();

    await expect
      .poll(
        async () => {
          const hud = await request.get(`${E2E_API_BASE_URL}/api/rooms/default/variable-hud`);
          if (!hud.ok()) return 0;
          const body = (await hud.json()) as { values?: Record<string, unknown> };
          const value = Number(body.values?.[marker]);
          return Number.isFinite(value) ? value : 0;
        },
        { timeout: 120_000 },
      )
      .toBeGreaterThanOrEqual(8);

    const finalHud = await request.get(`${E2E_API_BASE_URL}/api/rooms/default/variable-hud`);
    const finalBody = (await finalHud.json()) as { values?: Record<string, unknown> };
    const finalValue = String(finalBody.values?.[marker] ?? "");
    await expect(page.getByTestId(`variable-hud-${marker}`)).toContainText(finalValue, {
      timeout: 20_000,
    });

    // 至少产生过 AI 消息，证明真实 API 被调用
    const messages = await fetchRoomMessages(request, { since, limit: 50 });
    const aiCount = messages.filter(
      (m) => !m.is_system && m.sender_type === "ai" && m.content.trim().length > 0,
    ).length;
    expect(aiCount).toBeGreaterThan(0);
  });
});
