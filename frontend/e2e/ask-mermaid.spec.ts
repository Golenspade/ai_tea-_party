import { expect, test, type Page, type Route } from "@playwright/test";

const character = {
  id: "char-1",
  name: "Navigator",
  personality: "calm",
  background: "Guides the room through decisions.",
  speaking_style: "concise",
  is_active: true,
};

const mermaidMessage = {
  id: "message-1",
  character_id: character.id,
  character_name: character.name,
  content: [
    "路线图如下：",
    "",
    "```mermaid",
    "graph TD",
    "A[入口] --> B[右边]",
    "```",
  ].join("\n"),
  timestamp: "2026-06-09T00:00:00.000Z",
  is_system: false,
  sender_type: "ai",
};

const pendingAsk = {
  id: "ask-1",
  room_id: "default",
  request_id: "request-1",
  character_id: character.id,
  question: "下一步怎么走？",
  choices: ["左边", "右边"],
  allow_custom: false,
  multiple: false,
  status: "pending",
  created_at: "2026-06-09T00:00:01.000Z",
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockPhaseTwoApi(page: Page) {
  const state: {
    answerPayload: unknown;
    resumeCalled: boolean;
    pending: typeof pendingAsk | null;
  } = {
    answerPayload: null,
    resumeCalled: false,
    pending: pendingAsk,
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
      await fulfillJson(route, [mermaidMessage]);
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
      await fulfillJson(route, {
        content: "",
        label: "当前形势",
        version: 0,
      });
      return;
    }

    if (method === "GET" && path === "/api/rooms/default/asks/pending") {
      await fulfillJson(route, { ask: state.pending });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/asks/ask-1/answer") {
      state.answerPayload = JSON.parse(request.postData() || "{}");
      state.pending = null;
      await fulfillJson(route, { ask: { ...pendingAsk, status: "resolved" } });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/generate/stream/resume") {
      state.resumeCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: {
          "Cache-Control": "no-cache",
        },
        body: [
          'data: {"type":"delta","content":"继续前进","request_id":"request-resume"}',
          "",
          'data: {"type":"final","request_id":"request-resume"}',
          "",
        ].join("\n"),
      });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mocked route: ${method} ${path}` }, 404);
  });

  return state;
}

test("Phase 2: Mermaid 渲染并在回答 Ask 后自动续写", async ({ page }) => {
  const apiState = await mockPhaseTwoApi(page);

  await page.goto("/");

  await expect(page.getByText("路线图如下：")).toBeVisible();
  await expect(page.locator('[aria-label="Mermaid 图表"] svg')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("下一步怎么走？")).toBeVisible();

  await page.getByRole("button", { name: "右边" }).click();
  await page.getByRole("button", { name: "确认选择" }).click();

  await expect.poll(() => apiState.answerPayload).toEqual({ selected: ["右边"] });
  await expect.poll(() => apiState.resumeCalled).toBe(true);
  await expect(page.getByText("暂无待回答的问题")).toBeVisible();
  await expect(page.getByRole("main").getByText("继续前进")).toBeVisible();
});
