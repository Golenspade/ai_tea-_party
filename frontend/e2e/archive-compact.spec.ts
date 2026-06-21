import { expect, test, type Page, type Route } from "@playwright/test";

const character = {
  id: "char-1",
  name: "Archivist",
  personality: "organized",
  background: "Maintains room history.",
  speaking_style: "brief",
  is_active: true,
};

const messages = [
  {
    id: "message-1",
    character_id: "char-1",
    character_name: "Archivist",
    content: "第一条旧消息",
    timestamp: "2026-06-09T00:00:01.000Z",
    is_system: false,
    sender_type: "ai",
  },
  {
    id: "message-2",
    character_id: "char-1",
    character_name: "Archivist",
    content: "第二条旧消息",
    timestamp: "2026-06-09T00:00:02.000Z",
    is_system: false,
    sender_type: "ai",
  },
];

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockArchiveApi(page: Page) {
  const state = {
    summaries: [] as Array<Record<string, unknown>>,
    archives: [] as Array<Record<string, unknown>>,
    compactCalled: false,
    archiveCalled: false,
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
      await fulfillJson(route, messages);
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

    if (method === "GET" && path === "/api/rooms/default/summaries") {
      await fulfillJson(route, { room_id: "default", summaries: state.summaries });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/compact") {
      state.compactCalled = true;
      const summary = {
        id: "summary-1",
        room_id: "default",
        start_message_id: "message-1",
        end_message_id: "message-3",
        message_count: 3,
        summary: "旧消息已经压缩。",
        source: "deterministic",
        created_at: "2026-06-09T00:01:00.000Z",
      };
      state.summaries = [summary];
      await fulfillJson(route, {
        room_id: "default",
        status: "committed",
        keep_recent: 25,
        range: {
          start_message_id: "message-1",
          end_message_id: "message-3",
          message_count: 3,
        },
        summary,
      });
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/archives") {
      await fulfillJson(route, { room_id: "default", archives: state.archives });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/archives") {
      state.archiveCalled = true;
      const archive = {
        id: "archive-1",
        room_id: "default",
        title: "Archivist Archive",
        created_at: "2026-06-09T00:02:00.000Z",
        manifest: {
          schema_version: 1,
          archive_id: "archive-1",
          room_id: "default",
          title: "Archivist Archive",
          created_at: "2026-06-09T00:02:00.000Z",
          message_count: 2,
          summary_count: state.summaries.length,
          variable_count: 0,
          world_info_book_ids: [],
        },
      };
      state.archives = [archive];
      await fulfillJson(route, { status: "success", archive });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mocked route: ${method} ${path}` }, 404);
  });

  return state;
}

test("Phase 3: Compact 和 Archive 入口更新侧栏状态", async ({ page }) => {
  const apiState = await mockArchiveApi(page);

  await page.goto("/");

  await expect(page.getByText("暂无历史摘要")).toBeVisible();
  await expect(page.getByText("暂无归档")).toBeVisible();

  await page.getByRole("button", { name: /Compact/ }).click();
  await expect.poll(() => apiState.compactCalled).toBe(true);
  await expect(page.getByText("已压缩 3 条")).toBeVisible();
  await expect(page.getByText("旧消息已经压缩。")).toBeVisible();

  await page.getByRole("button", { name: /^Archive$/ }).click();
  await expect.poll(() => apiState.archiveCalled).toBe(true);
  await expect(page.getByText("Archivist Archive")).toBeVisible();
  await expect(page.getByText(/2 messages/)).toBeVisible();
});
