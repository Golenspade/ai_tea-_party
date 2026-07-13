import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";
import { assertBackendHealthy, waitForConnected } from "./helpers/live";

/**
 * Variable HUD 全栈 E2E（真实 backend REST + WS，无 page.route mock）。
 * 前置：backend :3004；Playwright 会起 frontend :3001。
 */
test.describe("Variable HUD (live backend)", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page, request }) => {
    await assertBackendHealthy(request);
    await waitForConnected(page);
  });

  test("HUD shows danger after /setvar", async ({ page }) => {
    const variableName = "danger";
    const composer = page.getByPlaceholder("Type your inquiry here...");
    const submitBtn = page.getByRole("button", { name: "Submit" });

    await composer.fill(`/setvar ${variableName} 15`);
    await submitBtn.click();

    const hudItem = page.getByTestId(`variable-hud-${variableName}`);
    await expect(page.getByTestId("variable-hud-panel")).toBeVisible({ timeout: 15_000 });
    await expect(hudItem).toBeVisible({ timeout: 15_000 });
    await expect(hudItem).toContainText("15");
  });

  test("HUD shows explicit Chinese label from variable-hud API", async ({ page, request }) => {
    const put = await request.put(`${E2E_API_BASE_URL}/api/rooms/default/variable-displays`, {
      data: {
        displays: [
          {
            name: "danger",
            label: "危险",
            min: 0,
            max: 100,
            polarity: "higher_is_worse",
            show_in_hud: true,
            order: 1,
          },
        ],
      },
    });
    expect(put.ok()).toBeTruthy();

    const set = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/set`, {
      data: { name: "danger", value: 22 },
    });
    expect(set.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });

    const hudItem = page.getByTestId("variable-hud-danger");
    await expect(hudItem).toBeVisible({ timeout: 15_000 });
    await expect(hudItem).toContainText("危险");
    await expect(hudItem).toContainText("22");

    const hudApi = await request.get(`${E2E_API_BASE_URL}/api/rooms/default/variable-hud`);
    expect(hudApi.ok()).toBeTruthy();
    const payload = (await hudApi.json()) as {
      displays: Array<{ name: string; label: string; source: string }>;
      values: Record<string, unknown>;
    };
    const danger = payload.displays.find((d) => d.name === "danger");
    expect(danger?.label).toBe("危险");
    expect(danger?.source).toBe("explicit");
    expect(payload.values.danger).toBe(22);
  });

  test("HUD updates after /incvar without manual refresh", async ({ page }) => {
    const variableName = `hud_e2e_${Date.now()}`;
    const composer = page.getByPlaceholder("Type your inquiry here...");
    const submitBtn = page.getByRole("button", { name: "Submit" });

    await composer.fill(`/setvar ${variableName} 10`);
    await submitBtn.click();
    await expect(page.getByTestId(`variable-hud-${variableName}`)).toContainText("10", {
      timeout: 15_000,
    });

    await composer.fill(`/incvar ${variableName} 5`);
    await submitBtn.click();

    await expect(page.getByTestId(`variable-hud-${variableName}`)).toContainText("15", {
      timeout: 15_000,
    });
  });

  test("global variables do not appear in HUD", async ({ page, request }) => {
    const name = `global_hud_${Date.now()}`;
    const response = await request.post(`${E2E_API_BASE_URL}/api/variables/global/set`, {
      data: { name, value: 42 },
    });
    expect(response.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId(`variable-hud-${name}`)).toHaveCount(0);
  });

  test("HUD hides when no numeric room variables remain", async ({ page }) => {
    const variableName = `hud_tmp_${Date.now()}`;
    const composer = page.getByPlaceholder("Type your inquiry here...");
    const submitBtn = page.getByRole("button", { name: "Submit" });

    await composer.fill(`/setvar ${variableName} 3`);
    await submitBtn.click();
    await expect(page.getByTestId(`variable-hud-${variableName}`)).toBeVisible({
      timeout: 15_000,
    });

    await composer.fill(`/flushvar ${variableName}`);
    await submitBtn.click();

    await expect(page.getByTestId(`variable-hud-${variableName}`)).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  test("PUT variable-displays updates HUD label after reload", async ({ page, request }) => {
    const name = `label_e2e_${Date.now()}`;
    const set = await request.post(`${E2E_API_BASE_URL}/api/rooms/default/variables/set`, {
      data: { name, value: 40 },
    });
    expect(set.ok()).toBeTruthy();

    const put = await request.put(`${E2E_API_BASE_URL}/api/rooms/default/variable-displays`, {
      data: {
        displays: [
          {
            name: "danger",
            label: "危险",
            min: 0,
            max: 100,
            polarity: "higher_is_worse",
            show_in_hud: true,
            order: 1,
          },
          {
            name,
            label: "自定义标签",
            min: 0,
            max: 100,
            polarity: "higher_is_better",
            show_in_hud: true,
            order: 2,
          },
        ],
      },
    });
    expect(put.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });

    const item = page.getByTestId(`variable-hud-${name}`);
    await expect(item).toBeVisible({ timeout: 15_000 });
    await expect(item).toContainText("自定义标签");
    await expect(item).toContainText("40");
  });
});
