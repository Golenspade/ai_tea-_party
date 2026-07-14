import { expect, type APIRequestContext } from "@playwright/test";

import { E2E_API_BASE_URL } from "./constants";

const LIVE_LLM_ENV_KEYS = [
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "XAI_API_KEY",
  "MOONSHOT_API_KEY",
  "MINIMAX_API_KEY",
] as const;

/** 强制走真实后端：设置 E2E_LIVE=1 或未设置 mock 模式时默认启用。 */
export function isLiveBackendEnabled(): boolean {
  if (process.env.E2E_MOCK === "1") return false;
  if (process.env.E2E_LIVE === "0") return false;
  return true;
}

/** 是否允许真实 LLM 调用（环境变量中存在任一 provider key）。 */
export function hasLiveLlmCredentials(): boolean {
  if (process.env.E2E_LIVE_LLM === "0") return false;
  return LIVE_LLM_ENV_KEYS.some((key) => {
    const value = process.env[key]?.trim();
    if (!value) return false;
    return !value.startsWith("your_") && value !== "changeme";
  });
}

export function liveLlmDescribeTitle(base: string): string {
  return hasLiveLlmCredentials() ? base : `${base} (skipped: no LLM API key)`;
}

export async function assertBackendHealthy(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${E2E_API_BASE_URL}/api/health`);
  expect(response.ok(), `backend health failed: ${E2E_API_BASE_URL}`).toBeTruthy();
  const body = (await response.json()) as { status?: string };
  expect(body.status).toBe("healthy");
}

export async function waitForConnected(
  page: import("@playwright/test").Page,
  timeout = 20_000,
): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[title="Connected"]')).toBeVisible({ timeout });
}
