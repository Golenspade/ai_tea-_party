import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";
import { assertBackendHealthy, waitForConnected } from "./helpers/live";

/**
 * Live-backend E2E for variable change effects + prompt-facing Active Branches.
 * Requires backend :3004 (same as variable-hud.spec.ts).
 */
test.describe("Variable effects + Active Branches (live backend)", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page, request }) => {
    await assertBackendHealthy(request);
    await waitForConnected(page);
  });

  test("WS 变量递增触发 HUD toast 与脉冲", async ({ page, request }) => {
    const name = `toast_e2e_${Date.now()}`;

    const displays = await request.put(
      `${E2E_API_BASE_URL}/api/rooms/default/variable-displays`,
      {
        data: {
          displays: [
            {
              name,
              label: "测试条",
              min: 0,
              max: 100,
              polarity: "higher_is_worse",
              show_in_hud: true,
              order: 1,
            },
          ],
        },
      },
    );
    expect(displays.ok()).toBeTruthy();

    const set = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/set`, {
      data: { name, value: 10 },
    });
    expect(set.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`variable-hud-${name}`)).toContainText("10", {
      timeout: 15_000,
    });

    const inc = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/inc`, {
      data: { name, value: 5 },
    });
    expect(inc.ok()).toBeTruthy();

    await expect(page.getByTestId(`variable-change-toast-${name}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId(`variable-change-toast-${name}`)).toContainText("+5");
    await expect(page.getByTestId(`variable-hud-${name}`)).toContainText("15", {
      timeout: 10_000,
    });
  });

  test("变量达阈值后 Active Branches 点亮行为书规则（prompt 效果面）", async ({
    page,
    request,
  }) => {
    const marker = `e2e_branch_${Date.now()}`;
    const ruleName = `rule_${marker}`;
    const promptText = `E2E分支命中：${marker}`;

    const createRule = await request.post(
      `${E2E_API_BASE_URL}/api/rooms/default/behavior-rules`,
      {
        data: {
          name: ruleName,
          enabled: true,
          priority: 10,
          condition_logic: "AND",
          conditions: [
            {
              scope: "room",
              name: marker,
              op: "gte",
              value: 8,
            },
          ],
          prompt_text: promptText,
        },
      },
    );
    expect(createRule.ok()).toBeTruthy();

    // Reset below threshold first.
    const low = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/set`, {
      data: { name: marker, value: 2 },
    });
    expect(low.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });

    const variablesSidebar = page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Variables" }) });

    await expect(variablesSidebar.getByText(ruleName, { exact: true })).toHaveCount(0);

    const high = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/set`, {
      data: { name: marker, value: 12 },
    });
    expect(high.ok()).toBeTruthy();

    await expect(variablesSidebar.getByText(ruleName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(variablesSidebar.getByText(promptText, { exact: true })).toBeVisible();

    // API surface used by prompt assembler / Active Branches panel.
    const branches = await request.get(
      `${E2E_API_BASE_URL}/api/rooms/default/branches/active`,
    );
    expect(branches.ok()).toBeTruthy();
    const payload = (await branches.json()) as {
      branches: Array<{ name: string; content: string; type: string }>;
    };
    expect(payload.branches.some((item) => item.name === ruleName)).toBeTruthy();
    expect(payload.branches.some((item) => item.content === promptText)).toBeTruthy();
  });
});
