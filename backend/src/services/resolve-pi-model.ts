import { getModel, getModels, type KnownProvider, type Model } from "@earendil-works/pi-ai";

/** App 内 provider id → pi-ai KnownProvider */
export const APP_PROVIDER_TO_PI: Record<string, KnownProvider> = {
  openai: "openai",
  deepseek: "deepseek",
  gemini: "google",
  xai: "xai",
  minimax: "minimax",
  moonshot: "moonshotai",
};

/**
 * 应用层模型 id（含历史 Python 命名）→ pi-ai 注册表中的 model id。
 * 未列出的 id 会原样尝试 getModel。
 */
export const APP_MODEL_ALIASES: Record<string, Record<string, string>> = {
  deepseek: {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
  },
  gemini: {},
  openai: {},
  xai: {
    "grok-3-mini": "grok-3-fast",
  },
  minimax: {
    "MiniMax-M2.1": "MiniMax-M2.7",
  },
  moonshot: {
    "kimi-k2-instruct": "kimi-k2-0905-preview",
  },
};

export function resolvePiProvider(appProvider: string): KnownProvider | undefined {
  return APP_PROVIDER_TO_PI[appProvider];
}

export function resolvePiModelId(appProvider: string, appModelId: string): string {
  return APP_MODEL_ALIASES[appProvider]?.[appModelId] ?? appModelId;
}

export function resolvePiModel(appProvider: string, appModelId: string): Model<string> | undefined {
  const piProvider = resolvePiProvider(appProvider);
  if (!piProvider) {
    return undefined;
  }

  const candidates = [
    resolvePiModelId(appProvider, appModelId),
    appModelId,
  ];

  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const model = getModel(piProvider, id as never);
    if (model) {
      return model;
    }
  }

  const fallback = getModels(piProvider)[0];
  return fallback;
}

/** 解析 .env 中 AI_PROVIDER（Python 时代命名）为应用 provider + model */
export function parseEnvAiProvider(raw: string | undefined): { provider: string; model: string } | null {
  if (!raw?.trim()) {
    return null;
  }

  const key = raw.trim().toLowerCase().replace(/-/g, "_");
  const map: Record<string, { provider: string; model: string }> = {
    deepseek_chat: { provider: "deepseek", model: "deepseek-chat" },
    deepseek_reasoner: { provider: "deepseek", model: "deepseek-reasoner" },
    gemini_25_flash: { provider: "gemini", model: "gemini-2.5-flash" },
    gemini_25_pro: { provider: "gemini", model: "gemini-2.5-pro" },
    openai: { provider: "openai", model: "gpt-4o-mini" },
  };

  if (map[key]) {
    return map[key];
  }

  if (key.includes("/")) {
    const [provider, model] = key.split("/", 2);
    if (provider && model) {
      return { provider, model };
    }
  }

  return null;
}
