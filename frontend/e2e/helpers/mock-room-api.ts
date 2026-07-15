import type { Page, Route } from "@playwright/test";

export type MockCharacter = {
  id: string;
  name: string;
  personality?: string;
  background?: string;
  speaking_style?: string;
  is_active?: boolean;
};

export type MockVariable = {
  name: string;
  value: unknown;
  scope: "room" | "global";
};

export type MockBranch = {
  type: "world_info" | "behavior_rule";
  id: string;
  name: string;
  content: string;
  source?: string;
};

export type MockRoomApiState = {
  characters: MockCharacter[];
  messages: Array<Record<string, unknown>>;
  roomVariables: MockVariable[];
  globalVariables: MockVariable[];
  branches: MockBranch[];
  bar: { content: string; label: string; version: number };
  pendingAsk: Record<string, unknown> | null;
  streamCalls: number;
  resumeCalls: number;
  lastStreamBody: unknown;
  variableMutations: Array<{ method: string; path: string; body: unknown }>;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export function encodeSse(events: unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n`).join("\n") + "\n";
}

/**
 * Install a mutable room API mock covering the chat shell + variable/agent surfaces.
 * Callers can override `onGenerateStream` / `onResumeStream` for SSE scenarios.
 */
export async function installMockRoomApi(
  page: Page,
  options?: {
    initial?: Partial<MockRoomApiState>;
    onGenerateStream?: (state: MockRoomApiState, route: Route, body: unknown) => Promise<void>;
    onResumeStream?: (state: MockRoomApiState, route: Route, body: unknown) => Promise<void>;
  },
): Promise<MockRoomApiState> {
  const state: MockRoomApiState = {
    characters: options?.initial?.characters ?? [
      {
        id: "char-1",
        name: "Narrator",
        personality: "observant",
        background: "Tracks room state.",
        speaking_style: "precise",
        is_active: true,
      },
    ],
    messages: options?.initial?.messages ?? [],
    roomVariables: options?.initial?.roomVariables ?? [],
    globalVariables: options?.initial?.globalVariables ?? [],
    branches: options?.initial?.branches ?? [],
    bar: options?.initial?.bar ?? { content: "", label: "当前形势", version: 0 },
    pendingAsk: options?.initial?.pendingAsk ?? null,
    streamCalls: 0,
    resumeCalls: 0,
    lastStreamBody: null,
    variableMutations: [],
  };

  const roomVarsPayload = () => ({
    variables: state.roomVariables.map((item) => ({
      name: item.name,
      value: item.value,
      scope: "room",
    })),
  });

  const globalVarsPayload = () => ({
    variables: state.globalVariables.map((item) => ({
      name: item.name,
      value: item.value,
      scope: "global",
    })),
  });

  const hudPayload = () => {
    const values: Record<string, unknown> = {};
    for (const item of state.roomVariables) {
      values[item.name] = item.value;
    }
    const displays = state.roomVariables
      .filter((item) => typeof item.value === "number" && Number.isFinite(item.value))
      .map((item, index) => ({
        name: item.name,
        label: item.name === "danger" ? "危险" : item.name,
        min: 0,
        max: 100,
        polarity: item.name === "danger" ? "higher_is_worse" : "higher_is_better",
        show_in_hud: true,
        order: index + 1,
        source: item.name === "danger" ? "explicit" : "inferred",
      }));
    return { displays, values };
  };

  const upsertRoomVariable = (name: string, value: unknown) => {
    const index = state.roomVariables.findIndex((item) => item.name === name);
    const next: MockVariable = { name, value, scope: "room" };
    if (index < 0) state.roomVariables.push(next);
    else state.roomVariables[index] = next;
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const bodyText = request.postData() || "";
    const body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};

    if (method === "GET" && path === "/api/rooms/default/characters") {
      await fulfillJson(route, state.characters);
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/messages") {
      await fulfillJson(route, state.messages);
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/variables") {
      await fulfillJson(route, roomVarsPayload());
      return;
    }
    if (method === "GET" && path === "/api/variables/global") {
      await fulfillJson(route, globalVarsPayload());
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/variable-hud") {
      await fulfillJson(route, hudPayload());
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/branches/active") {
      await fulfillJson(route, { branches: state.branches });
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/presence") {
      await fulfillJson(route, { room_id: "default", users: [] });
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/bar") {
      await fulfillJson(route, state.bar);
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/asks/pending") {
      await fulfillJson(route, { ask: state.pendingAsk });
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/summaries") {
      await fulfillJson(route, { summaries: [] });
      return;
    }
    if (method === "GET" && path === "/api/rooms/default/archives") {
      await fulfillJson(route, { archives: [] });
      return;
    }
    if (method === "GET" && path === "/api/settings") {
      await fulfillJson(route, { response_length: "default" });
      return;
    }
    if (method === "GET" && path === "/api/config") {
      await fulfillJson(route, { current_config: null, providers: {} });
      return;
    }
    if (method === "GET" && path === "/api/providers") {
      await fulfillJson(route, {});
      return;
    }
    if (method === "GET" && path === "/api/world-info") {
      await fulfillJson(route, []);
      return;
    }
    if (method === "GET" && path === "/api/personas") {
      await fulfillJson(route, []);
      return;
    }
    if (method === "GET" && path === "/api/health") {
      await fulfillJson(route, { status: "healthy" });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/variables/set") {
      state.variableMutations.push({ method, path, body });
      upsertRoomVariable(String(body.name || ""), body.value);
      await fulfillJson(route, {
        variable: { name: body.name, value: body.value, scope: "room" },
      });
      return;
    }
    if (method === "POST" && path === "/api/rooms/default/variables/inc") {
      state.variableMutations.push({ method, path, body });
      const name = String(body.name || "");
      const current = state.roomVariables.find((item) => item.name === name);
      const base = typeof current?.value === "number" ? current.value : 0;
      const delta = typeof body.value === "number" ? body.value : 1;
      upsertRoomVariable(name, base + delta);
      await fulfillJson(route, {
        variable: { name, value: base + delta, scope: "room" },
      });
      return;
    }
    if (method === "POST" && path === "/api/rooms/default/variables/dec") {
      state.variableMutations.push({ method, path, body });
      const name = String(body.name || "");
      const current = state.roomVariables.find((item) => item.name === name);
      const base = typeof current?.value === "number" ? current.value : 0;
      const delta = typeof body.value === "number" ? body.value : 1;
      upsertRoomVariable(name, base - delta);
      await fulfillJson(route, {
        variable: { name, value: base - delta, scope: "room" },
      });
      return;
    }
    if (method === "POST" && path === "/api/rooms/default/variables/add") {
      state.variableMutations.push({ method, path, body });
      upsertRoomVariable(String(body.name || ""), body.value);
      await fulfillJson(route, {
        variable: { name: body.name, value: body.value, scope: "room" },
      });
      return;
    }

    if (method === "POST" && /\/api\/rooms\/default\/asks\/[^/]+\/answer$/.test(path)) {
      state.pendingAsk = null;
      await fulfillJson(route, { ask: { id: "ask-1", status: "resolved" } });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/generate/stream") {
      state.streamCalls += 1;
      state.lastStreamBody = body;
      if (options?.onGenerateStream) {
        await options.onGenerateStream(state, route, body);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: { "Cache-Control": "no-cache" },
        body: encodeSse([
          { type: "final", request_id: "request-1", content: "" },
        ]),
      });
      return;
    }

    if (method === "POST" && path === "/api/rooms/default/generate/stream/resume") {
      state.resumeCalls += 1;
      state.lastStreamBody = body;
      if (options?.onResumeStream) {
        await options.onResumeStream(state, route, body);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: { "Cache-Control": "no-cache" },
        body: encodeSse([
          { type: "final", request_id: "request-resume", content: "" },
        ]),
      });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mocked route: ${method} ${path}` }, 404);
  });

  return state;
}

export async function clickSpeak(page: Page, characterName = "Narrator") {
  await page.getByText(new RegExp(`I\\.\\s*${characterName}`)).hover();
  await page.locator('button[title="Speak"]').click();
}
