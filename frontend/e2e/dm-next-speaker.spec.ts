import { expect, test, type Page, type Route } from "@playwright/test";

const character = {
  id: "char-1",
  name: "Director",
  personality: "calm",
  background: "Chooses the next speaker.",
  speaking_style: "brief",
  is_active: true,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockDmApi(page: Page) {
  const state = {
    designatedCharacterId: "",
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/api/rooms/default/characters") {
      await fulfillJson(route, [character]);
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/messages") {
      await fulfillJson(route, []);
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/variables") {
      await fulfillJson(route, { variables: [] });
      return;
    }

    if (method === "GET" && path === "/api/variables/global") {
      await fulfillJson(route, { variables: [] });
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/presence") {
      await fulfillJson(route, { room_id: "default", users: [] });
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/bar") {
      await fulfillJson(route, { content: "", label: "当前形势", version: 0 });
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/asks/pending") {
      await fulfillJson(route, { ask: null });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/dm/next-speaker/char-1") {
      state.designatedCharacterId = "char-1";
      await fulfillJson(route, {
        status: "success",
        choice: {
          room_id: "default",
          character_id: "char-1",
          character_name: "Director",
          selected_at: "2026-06-09T00:00:00.000Z",
          source: "user",
          reason: "用户指定下轮发言者",
        },
      });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mocked route: ${method} ${path}` }, 404);
  });

  return state;
}

test("Phase 2: 用户指定 DM 下轮发言者", async ({ page }) => {
  const apiState = await mockDmApi(page);

  await page.goto("/");

  await page.getByText("I. Director").hover();
  await page.locator('button[title="指定下轮"]').click();

  await expect.poll(() => apiState.designatedCharacterId).toBe("char-1");
  await expect(page.getByText("[Next: Director]")).toBeVisible();
});
