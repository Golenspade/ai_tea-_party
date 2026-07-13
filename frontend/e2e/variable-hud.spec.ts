import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";

test.describe("Variable HUD", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });
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

    // Trigger a room paint / reconnect wait
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
});
