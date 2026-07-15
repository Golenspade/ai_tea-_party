import { expect, test, type Page, type Route } from "@playwright/test";

const character = {
  id: "char-1",
  name: "Editor",
  personality: "precise",
  background: "Revises prior room prose.",
  speaking_style: "direct",
  is_active: true,
};

const initialMessage = {
  id: "message-1",
  character_id: character.id,
  character_name: character.name,
  content: "保留段\n\n旧段",
  timestamp: "2026-06-09T00:00:00.000Z",
  is_system: false,
  sender_type: "ai",
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockPatchApi(page: Page) {
  const state = {
    streamCalled: false,
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
      await fulfillJson(route, [initialMessage]);
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

    if (method === "POST" && path === "/api/rooms/default/generate/stream") {
      state.streamCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: {
          "Cache-Control": "no-cache",
        },
        body: [
          'data: {"type":"message_patch","request_id":"request-1","patch":{"room_id":"default","message_id":"message-1","content":"保留段\\n\\n新段","previous_content":"保留段\\n\\n旧段","patched_at":"2026-06-09T00:00:02.000Z","reason":"修正"}}',
          "",
          'data: {"type":"final","request_id":"request-1","message_id":"message-final","content":""}',
          "",
        ].join("\n"),
      });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mocked route: ${method} ${path}` }, 404);
  });

  return state;
}

test("Phase 2: Patch Room 更新已有消息并高亮", async ({ page }) => {
  const apiState = await mockPatchApi(page);

  await page.goto("/");
  await expect(page.getByRole("main").getByText("保留段")).toBeVisible();
  await expect(page.getByRole("main").getByText("旧段")).toBeVisible();

  await page.getByText("I. Editor").hover();
  await page.locator('button[title="Speak"]').click();

  await expect.poll(() => apiState.streamCalled).toBe(true);
  await expect(page.getByRole("main").getByText("新段")).toBeVisible();
  await expect(page.locator("[data-patched='true']")).toBeVisible();
  await expect(page.locator("[data-paragraph-diff='true']")).toBeVisible();
  await expect(page.locator("[data-patch-variant='delete']")).toContainText("旧段");
  await expect(page.locator("[data-patch-variant='insert']")).toContainText("新段");
});
