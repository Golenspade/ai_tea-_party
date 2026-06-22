import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getEnvApiKey, type KnownProvider } from "@earendil-works/pi-ai";
import { getOAuthApiKey } from "@earendil-works/pi-ai/oauth";

import { APP_PROVIDER_TO_PI } from "./resolve-pi-model";

const PI_AGENT_AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

/** pi-ai KnownProvider → 应用层 provider id */
const PI_PROVIDER_TO_APP: Record<string, string> = Object.fromEntries(
  Object.entries(APP_PROVIDER_TO_PI).map(([app, pi]) => [pi, app]),
);

export function credentialSettingKey(provider: string, field: "api_key" | "api_base"): string {
  return `cred:${provider}:${field}`;
}

export function appProviderForPiProvider(piProvider: string): string {
  return PI_PROVIDER_TO_APP[piProvider] ?? piProvider;
}

type PiAuthEntry = {
  type?: string;
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
};

let cachedPiAuth: Record<string, PiAuthEntry> | null | undefined;

function loadPiAgentAuthFile(): Record<string, PiAuthEntry> {
  if (cachedPiAuth !== undefined) {
    return cachedPiAuth ?? {};
  }

  if (!existsSync(PI_AGENT_AUTH_PATH)) {
    cachedPiAuth = null;
    return {};
  }

  try {
    cachedPiAuth = JSON.parse(readFileSync(PI_AGENT_AUTH_PATH, "utf-8")) as Record<string, PiAuthEntry>;
    return cachedPiAuth ?? {};
  } catch {
    cachedPiAuth = null;
    return {};
  }
}

/** 测试或热重载时清空 Pi auth 缓存 */
export function clearPiAgentAuthCache(): void {
  cachedPiAuth = undefined;
}

async function resolveFromPiAgentAuth(piProvider: string): Promise<string | undefined> {
  const auth = loadPiAgentAuthFile();
  const entry = auth[piProvider];
  if (!entry) {
    return undefined;
  }

  if (entry.type === "api_key" && typeof entry.key === "string" && entry.key.trim()) {
    return entry.key.trim();
  }

  if (entry.type === "oauth" && entry.access) {
    try {
      const result = await getOAuthApiKey(piProvider as never, auth as never);
      return result?.apiKey;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export interface PiCredentialResolverOptions {
  getStoredApiKey: (appProvider: string) => string | undefined;
}

/**
 * 解析 pi-ai provider 的 API Key，优先级：
 * 1. 前端/DB 持久化的应用层 provider 密钥
 * 2. process.env（pi-ai getEnvApiKey）
 * 3. ~/.pi/agent/auth.json（Pi CLI 登录态，含 OAuth）
 */
export async function resolveApiKeyForPiProvider(
  piProvider: string,
  options: PiCredentialResolverOptions,
): Promise<string | undefined> {
  const appProvider = appProviderForPiProvider(piProvider);
  const stored = options.getStoredApiKey(appProvider)?.trim();
  if (stored) {
    return stored;
  }

  const fromEnv = getEnvApiKey(piProvider as KnownProvider);
  if (fromEnv && fromEnv !== "<authenticated>") {
    return fromEnv;
  }

  return resolveFromPiAgentAuth(piProvider);
}

export function createPiGetApiKey(
  options: PiCredentialResolverOptions,
): (piProvider: string) => Promise<string | undefined> {
  return (piProvider: string) => resolveApiKeyForPiProvider(piProvider, options);
}

export function hasCredentialForAppProvider(
  appProvider: string,
  getStoredApiKey: (provider: string) => string | undefined,
): boolean {
  const piProvider = APP_PROVIDER_TO_PI[appProvider];
  if (!piProvider) {
    return false;
  }

  const stored = getStoredApiKey(appProvider)?.trim();
  if (stored) {
    return true;
  }

  const fromEnv = getEnvApiKey(piProvider);
  if (fromEnv) {
    return true;
  }

  const auth = loadPiAgentAuthFile();
  const entry = auth[piProvider];
  if (entry?.type === "api_key" && entry.key?.trim()) {
    return true;
  }
  if (entry?.type === "oauth" && entry.access) {
    return true;
  }

  return false;
}
