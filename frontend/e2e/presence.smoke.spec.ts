import { expect, test } from "@playwright/test";

import { E2E_API_BASE_URL } from "./helpers/constants";

test("presence API 返回 default 房间结构", async ({ request }) => {
  const response = await request.get(`${E2E_API_BASE_URL}/api/rooms/default/presence`);
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    room_id?: string;
    users?: Array<{ user_id?: string; nickname?: string; is_online?: boolean }>;
  };

  expect(payload.room_id).toBe("default");
  expect(Array.isArray(payload.users)).toBeTruthy();
});
