import { expect, test } from "@playwright/test";

import {
  clickSpeak,
  encodeSse,
  installMockRoomApi,
  type MockRoomApiState,
} from "./helpers/mock-room-api";

/**
 * Mocked E2E covering:
 * 1) Frontend panels (Variables / HUD / Ask / Status Bar / Active Branches)
 * 2) Agent tool behavior (write_to_room / write_to_bar / inc_variable / ask_user)
 * 3) Agent trajectory (Activity Card → tool labels → step hint)
 * 4) Prompt-effect surface (Active Branches lit by variable-gated rules)
 */

async function fulfillSse(route: Route, events: unknown[]) {
  await route.fulfill({
    status: 200,
    contentType: "text/event-stream; charset=utf-8",
    headers: { "Cache-Control": "no-cache" },
    body: encodeSse(events),
  });
}

test.describe("Frontend panels + Agent trajectory (mocked API)", () => {
  test("侧栏 Variables / Active Branches / 右侧 HUD 初始渲染", async ({ page }) => {
    await installMockRoomApi(page, {
      initial: {
        roomVariables: [
          { name: "danger", value: 12, scope: "room" },
          { name: "trust", value: 40, scope: "room" },
        ],
        globalVariables: [{ name: "chapter", value: 2, scope: "global" }],
        branches: [
          {
            type: "behavior_rule",
            id: "rule-high-danger",
            name: "高风险叙事",
            content: "危险升高时语气更紧张。",
            source: "行为书",
          },
          {
            type: "world_info",
            id: "wi-danger",
            name: "危机设定",
            content: "破庙外的风声骤紧。",
            source: "世界书",
          },
        ],
        bar: { content: "夜色已深。", label: "当前形势", version: 3 },
      },
    });

    await page.goto("/");

    const variablesSidebar = page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Variables" }) });

    await expect(variablesSidebar.getByRole("heading", { name: "Variables" })).toBeVisible();
    await expect(variablesSidebar.getByText("danger")).toBeVisible();
    await expect(variablesSidebar.getByText("trust")).toBeVisible();
    await expect(variablesSidebar.getByText("chapter")).toBeVisible();

    await expect(variablesSidebar.getByText("Active Branches")).toBeVisible();
    await expect(variablesSidebar.getByText("高风险叙事")).toBeVisible();
    await expect(variablesSidebar.getByText("危险升高时语气更紧张。")).toBeVisible();
    await expect(variablesSidebar.getByText("危机设定")).toBeVisible();

    await expect(page.getByTestId("variable-hud-panel")).toBeVisible();
    await expect(page.getByTestId("variable-hud-danger")).toContainText("危险");
    await expect(page.getByTestId("variable-hud-danger")).toContainText("12");
    await expect(page.getByTestId("variable-hud-trust")).toContainText("40");

    await expect(page.getByText("夜色已深。")).toBeVisible();
  });

  test("侧栏表单 set 变量后 HUD 与列表同步", async ({ page }) => {
    const state = await installMockRoomApi(page, {
      initial: {
        roomVariables: [{ name: "danger", value: 1, scope: "room" }],
      },
    });

    await page.goto("/");

    const variablesSidebar = page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Variables" }) });

    await variablesSidebar.getByPlaceholder("变量名").fill("mood");
    await variablesSidebar.getByPlaceholder("JSON/字符串/数字（留空=默认）").fill("42");
    await variablesSidebar.getByRole("button", { name: "执行" }).click();

    await expect.poll(() => state.variableMutations.length).toBeGreaterThan(0);
    await expect(variablesSidebar.getByText("mood")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("variable-hud-mood")).toContainText("42");
  });

  test("Agent 轨迹：Speak 后 Activity Card → 工具标签 → write_to_room / bar / 变量", async ({
    page,
  }) => {
    let releaseStream!: () => void;
    const holdStream = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });

    const state = await installMockRoomApi(page, {
      initial: {
        roomVariables: [{ name: "danger", value: 5, scope: "room" }],
        branches: [],
      },
      onGenerateStream: async (apiState, route) => {
        // Hold SSE until the test asserts the thinking Activity Card.
        await holdStream;
        apiState.roomVariables = [{ name: "danger", value: 13, scope: "room" }];
        apiState.branches = [
          {
            type: "behavior_rule",
            id: "rule-high-danger",
            name: "高风险叙事",
            content: "危险升高时语气更紧张。",
            source: "行为书",
          },
        ];
        apiState.bar = {
          content: "破庙内烛火摇曳。",
          label: "当前形势",
          version: 4,
        };
        await fulfillSse(route, [
          {
            type: "tool_call_start",
            request_id: "request-1",
            tool: "inc_variable",
            args: { name: "danger", delta: 8 },
          },
          {
            type: "tool_call_end",
            request_id: "request-1",
            tool: "inc_variable",
          },
          {
            type: "tool_call_start",
            request_id: "request-1",
            tool: "write_to_bar",
            args: { content: "破庙内烛火摇曳。" },
          },
          {
            type: "bar_update",
            request_id: "request-1",
            room_id: "default",
            content: "破庙内烛火摇曳。",
            label: "当前形势",
            version: 4,
          },
          {
            type: "tool_call_end",
            request_id: "request-1",
            tool: "write_to_bar",
          },
          {
            type: "tool_call_start",
            request_id: "request-1",
            tool: "write_to_room",
            args: { content: "风穿门缝，危险又近了一分。" },
          },
          {
            type: "room_message",
            request_id: "request-1",
            message: {
              id: "msg-tool-1",
              character_id: "char-1",
              character_name: "Narrator",
              content: "风穿门缝，危险又近了一分。",
              timestamp: "2026-07-14T00:00:00.000Z",
              is_system: false,
              sender_type: "ai",
            },
          },
          {
            type: "tool_call_end",
            request_id: "request-1",
            tool: "write_to_room",
          },
          {
            type: "final",
            request_id: "request-1",
            content: "",
          },
        ]);
      },
    });

    await page.goto("/");
    await expect(page.getByTestId("variable-hud-danger")).toContainText("5");

    await clickSpeak(page, "Narrator");

    // Trajectory layer A: thinking card while stream is held.
    await expect(page.getByTestId("agent-activity-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("agent-activity-card")).toHaveAttribute(
      "data-status",
      "thinking",
    );
    await expect(page.getByTestId("character-activity-indicator")).toBeVisible();

    releaseStream();

    await expect.poll(() => state.streamCalls).toBe(1);
    await expect(page.getByRole("main").getByText("风穿门缝，危险又近了一分。")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("破庙内烛火摇曳。")).toBeVisible();
    await expect(page.getByTestId("variable-hud-danger")).toContainText("13", {
      timeout: 15_000,
    });

    // Prompt-effect surface: Active Branches refresh after tool_call_end → loadVariables.
    const variablesSidebar = page
      .locator("aside")
      .filter({ has: page.getByRole("heading", { name: "Variables" }) });
    await expect(variablesSidebar.getByText("高风险叙事")).toBeVisible({ timeout: 10_000 });
    await expect(variablesSidebar.getByText("危险升高时语气更紧张。")).toBeVisible();
  });

  test("Agent ask_user：Ask 面板出现并可确认后续 resume", async ({ page }) => {
    const state = await installMockRoomApi(page, {
      onGenerateStream: async (apiState: MockRoomApiState, route) => {
        apiState.pendingAsk = {
          id: "ask-1",
          room_id: "default",
          request_id: "request-1",
          character_id: "char-1",
          question: "要不要推开那扇门？",
          choices: ["推开", "绕开"],
          allow_custom: false,
          multiple: false,
          status: "pending",
          created_at: "2026-07-14T00:00:01.000Z",
        };
        await fulfillSse(route, [
          {
            type: "tool_call_start",
            request_id: "request-1",
            tool: "ask_user",
            args: {
              question: "要不要推开那扇门？",
              choices: ["推开", "绕开"],
            },
          },
          {
            type: "ask_pending",
            request_id: "request-1",
            ask_id: "ask-1",
            question: "要不要推开那扇门？",
            choices: ["推开", "绕开"],
            allow_custom: false,
            multiple: false,
          },
          {
            type: "tool_call_end",
            request_id: "request-1",
            tool: "ask_user",
          },
          {
            type: "awaiting_user",
            request_id: "request-1",
          },
        ]);
      },
      onResumeStream: async (_apiState, route) => {
        await fulfillSse(route, [
          {
            type: "tool_call_start",
            request_id: "request-resume",
            tool: "write_to_room",
            args: { content: "门轴轻响，冷气扑面。" },
          },
          {
            type: "room_message",
            request_id: "request-resume",
            message: {
              id: "msg-resume-1",
              character_id: "char-1",
              character_name: "Narrator",
              content: "门轴轻响，冷气扑面。",
              timestamp: "2026-07-14T00:00:05.000Z",
              is_system: false,
              sender_type: "ai",
            },
          },
          {
            type: "tool_call_end",
            request_id: "request-resume",
            tool: "write_to_room",
          },
          {
            type: "final",
            request_id: "request-resume",
            content: "",
          },
        ]);
      },
    });

    await page.goto("/");
    await clickSpeak(page, "Narrator");

    await expect(page.getByText("要不要推开那扇门？")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "推开" }).click();
    await page.getByRole("button", { name: "确认选择" }).click();

    await expect.poll(() => state.resumeCalls).toBe(1);
    await expect(page.getByText("暂无待回答的问题")).toBeVisible();
    await expect(page.getByRole("main").getByText("门轴轻响，冷气扑面。")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Agent 错误轨迹：SSE error 展示 Activity Card 错误态", async ({ page }) => {
    await installMockRoomApi(page, {
      onGenerateStream: async (_state, route) => {
        await fulfillSse(route, [
          {
            type: "error",
            request_id: "request-err",
            message: "模型凭证无效",
          },
        ]);
      },
    });

    await page.goto("/");
    await clickSpeak(page, "Narrator");

    await expect(page.getByTestId("agent-activity-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("agent-activity-card")).toHaveAttribute(
      "data-status",
      "error",
    );
    await expect(page.getByText("模型凭证无效")).toBeVisible();
  });
});
