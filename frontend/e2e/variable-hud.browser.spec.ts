/**
 * Visual browser walkthrough for Variable HUD — writes screenshots to artifacts.
 * Run: pnpm exec playwright test e2e/variable-hud.browser.spec.ts --reporter=list
 */
import { expect, test } from "@playwright/test";
import path from "node:path";

const ARTIFACT_DIR = "/opt/cursor/artifacts/variable-hud-e2e";

test.describe("Variable HUD browser walkthrough", () => {
  test("open app, set room var, verify HUD, inc, screenshot", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "01-connected.png"),
      fullPage: true,
    });

    const composer = page.getByPlaceholder("Type your inquiry here...");
    const submitBtn = page.getByRole("button", { name: "Submit" });

    await composer.fill("/setvar danger 18");
    await submitBtn.click();

    const hud = page.getByTestId("variable-hud-panel");
    const danger = page.getByTestId("variable-hud-danger");
    await expect(hud).toBeVisible({ timeout: 15_000 });
    await expect(danger).toContainText("18");

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "02-hud-after-setvar.png"),
      fullPage: true,
    });

    // Crop-ish focus: HUD panel alone
    await hud.screenshot({
      path: path.join(ARTIFACT_DIR, "03-hud-panel-closeup.png"),
    });

    await composer.fill("/incvar danger 7");
    await submitBtn.click();
    await expect(danger).toContainText("25", { timeout: 15_000 });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "04-hud-after-incvar.png"),
      fullPage: true,
    });

    // Gauge fill should be non-zero width
    const fill = danger.locator("div.mt-2 > div").first();
    const width = await fill.evaluate((el) => (el as HTMLElement).style.width);
    expect(width).toBe("25%");
  });
});
