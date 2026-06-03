import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";

interface CharacterSummary {
  id: string;
  name: string;
}

test.describe("房间与角色冒烟", () => {
  test("默认房间 API 返回角色并在侧栏展示", async ({ page, request }) => {
    const response = await request.get(`${E2E_API_BASE_URL}/api/rooms/default/characters`);
    expect(response.ok()).toBeTruthy();

    const characters = (await response.json()) as CharacterSummary[];
    expect(characters.length).toBeGreaterThan(0);

    await page.goto("/");
    await expect(page.getByText(`I. ${characters[0].name}`)).toBeVisible({ timeout: 15_000 });
  });

  test("rooms API 包含 default 房间", async ({ request }) => {
    const response = await request.get(`${E2E_API_BASE_URL}/api/rooms`);
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as {
      rooms?: Array<{ id?: string; name?: string }>;
    };

    expect(payload.rooms?.some((room) => room.id === "default")).toBeTruthy();
  });

  test("health API 返回 healthy", async ({ request }) => {
    const response = await request.get(`${E2E_API_BASE_URL}/api/health`);
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as { status?: string };
    expect(payload.status).toBe("healthy");
  });
});
