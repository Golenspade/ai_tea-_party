import { expect, test } from "@playwright/test";

test.describe("WebSocket 冒烟", () => {
  test("页面加载后连接指示器变为 Connected", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByPlaceholder("Type your inquiry here...")).toBeVisible();
    await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\[\d+ 人在场:/)).toBeVisible({ timeout: 15_000 });
  });

  test("WebSocket 握手后收到 room_status 帧", async ({ page }) => {
    let gotRoomStatus = false;

    page.on("websocket", (ws) => {
      if (!ws.url().includes("/ws/default")) {
        return;
      }

      ws.on("framereceived", (frame) => {
        const payload = frame.payload.toString();
        if (payload.includes("room_status")) {
          gotRoomStatus = true;
        }
      });
    });

    await page.goto("/");
    await expect.poll(() => gotRoomStatus, { timeout: 15_000 }).toBe(true);
  });
});
