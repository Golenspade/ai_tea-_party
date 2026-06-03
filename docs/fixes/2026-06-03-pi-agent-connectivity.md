# 修复记录：Presence「无人连接」与 Pi Agent 空回复

**日期**：2026-06-03  
**范围**：TS 后端（`backend/`）+ Next.js 前端（`frontend/`）  
**验证**：后端单元测试 18 passed；Playwright E2E 9 passed（含单轮 Speak、Top 5 自动对话）

---

## 1. 现象

| 现象 | 用户侧表现 |
|------|------------|
| Presence | WebSocket 显示 `Connected`，页头仍显示 `[无人连接]` |
| AI 对话 | `POST /generate` 返回 `content: ""`，流式仅有空 `final` |
| 自动对话 | 点击 Commence Auto-Dialogue 后长时间无新 AI 消息 |

---

## 2. 根因与修复

### 2.1 Presence「无人连接」

**根因**：服务端在浏览器绑定 `ws.onmessage` **之前**就广播 `presence` 帧，首帧被丢弃；页面挂载时 REST 拉取 presence 往往尚无 WS 连接，得到空列表。

**修复**：

- `frontend/hooks/use-websocket.ts`：先注册 `onmessage`，再在 `onopen` 时用 REST `/api/rooms/:id/presence` 兜底拉取。
- `frontend/components/chat/chat-layout.tsx`：`isConnected === true` 时再次 `loadPresence()`。

### 2.2 Pi Agent 返回空内容

通过 `backend/scripts/debug-generate.ts` 订阅 Agent 事件，确认链路问题如下（可叠加）：

| # | 根因 | 典型错误/表现 | 修复 |
|---|------|----------------|------|
| A | 应用层模型 ID 与 `@earendil-works/pi-ai` 注册表不一致 | `api: unknown`，`No API provider registered` | 新增 `resolve-pi-model.ts`，别名映射（如 `deepseek-chat` → `deepseek-v4-flash`） |
| B | 从 `backend/` 启动时未加载项目根 `.env` | `No API key for provider: deepseek` | `index.ts` 依次加载 `./.env` 与 `../.env` |
| C | 传给 Agent 的 `messages[].content` 为字符串 | `assistantMsg.content.flatMap is not a function` | 改为 `[{ type: "text", text: "..." }]` |
| D | `agent.prompt()` 返回早于 `agent_end` | 流式队列先收到空 `final` | `finally` 中先 `await agent.waitForIdle()` 再收尾 |
| E | 历史中存在空 AI 消息 | 上下文末尾多条空 `assistant` | `prompt-assembler` 过滤 `content.trim().length === 0` |

### 2.3 自动对话（Top 5）几乎不产出消息

**根因**：`AUTO_CHAT_INTERVAL` 默认值误写为 `"5000"`，再乘以 `1000`，间隔约 **5000 秒（≈83 分钟）**。

**修复**：

- 默认改回 `"5"`（秒），即 `5 * 1000` ms。
- 启动时立即执行首轮 `runAutoChatTick()`，不等待第一个 interval。
- 用 `getRoomAutoChat(roomId)` 判断状态；失败时写 Fastify 日志。

---

## 3. Pi Agent 与 Provider / 模型说明

### 3.1 架构（非「SDK 里写死的单一默认模型」）

```
UI / API 配置 (AppState.currentProvider + currentModel)
        ↓
resolvePiModel(appProvider, appModelId)   ← backend/src/services/resolve-pi-model.ts
        ↓
@earendil-works/pi-ai  getModel(piProvider, piModelId)
        ↓
@earendil-works/pi-agent-core  Agent({ model, systemPrompt, messages, tools })
        ↓
pi-ai 按 model.api（如 openai-completions）调对应厂商 HTTP API
```

- **没有**在 Agent SDK 里写死「只用某一个全局默认模型」。
- 每次生成使用 **SQLite 中保存的 provider/model**（或首次启动时从 `.env` 的 `AI_PROVIDER` / `MODEL_OVERRIDE` 引导）。
- API Key 由 **pi-ai** 按 provider 从环境变量读取（如 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY`），与 Python 时代 `.env` 命名兼容。

### 3.2 应用 Provider → pi-ai Provider 映射

| 应用 `provider` | pi-ai `KnownProvider` | 环境变量 |
|-----------------|-------------------------|----------|
| `openai` | `openai` | `OPENAI_API_KEY` |
| `deepseek` | `deepseek` | `DEEPSEEK_API_KEY` |
| `gemini` | `google` | `GEMINI_API_KEY` |
| `xai` | `xai` | `XAI_API_KEY` |
| `minimax` | `minimax` | `MINIMAX_API_KEY` |
| `moonshot` | `moonshotai` | `MOONSHOT_API_KEY` |

### 3.3 常用模型别名（应用层 → pi-ai 注册表）

| 应用层 model | 解析后 pi-ai model | 说明 |
|--------------|-------------------|------|
| `deepseek-chat` | `deepseek-v4-flash` | 兼容旧配置名 |
| `deepseek-reasoner` | `deepseek-v4-pro` | 兼容 `AI_PROVIDER=deepseek_reasoner` |
| `gemini-2.5-flash` | （同名） | 走 `google` provider |
| `grok-3-mini` | `grok-3-fast` | xAI 别名 |
| `MiniMax-M2.1` | `MiniMax-M2.7` | MiniMax 别名 |

若别名与原名均无法 `getModel`，则回退到该 provider 在 pi-ai 中的**第一个**注册模型。

### 3.4 默认与推荐配置

- **代码默认**（无 DB、无 `.env`）：`openai` + `gpt-4o-mini`（`AppState` 构造函数）。
- **项目 `.env` 示例**：`AI_PROVIDER=deepseek_reasoner` → 首次启动映射为 `deepseek` + `deepseek-reasoner` → 实际调用 **`deepseek-v4-pro`**。
- **联调推荐**：在设置页选择 DeepSeek + `deepseek-chat`，实际调用 **`deepseek-v4-flash`**，需配置 `DEEPSEEK_API_KEY`。

---

## 4. 测试与复现

```bash
# 后端
cd backend && pnpm exec tsx src/index.ts

# 前端
cd frontend && npm run dev -- --hostname 127.0.0.1 --port 3001

# 单元测试
cd backend && pnpm test

# E2E（需后端已监听 3004）
cd frontend && E2E_API_BASE_URL=http://127.0.0.1:3004 npm run e2e

# 调试 Pi Agent 事件（需根目录 .env）
cd backend && pnpm exec tsx scripts/debug-generate.ts
```

---

## 5. 涉及文件（摘要）

| 区域 | 文件 |
|------|------|
| 模型解析 | `backend/src/services/resolve-pi-model.ts` |
| 编排 | `backend/src/services/orchestrator.ts` |
| 配置/环境 | `backend/src/index.ts`, `backend/src/store.ts` |
| 自动对话 | `backend/src/routes/rest.ts` |
| Presence | `frontend/hooks/use-websocket.ts`, `frontend/components/chat/chat-layout.tsx` |
| E2E | `frontend/e2e/*.smoke.spec.ts` |
| 引导测试 | `backend/src/utils/config-bootstrap.ts` |

---

## 6. 后续建议

- `getConfig().has_api_key` 目前恒为 `true`，可改为按当前 provider 的 `env_key` 检测。
- 设置页可展示「实际调用的 pi-ai 模型 id」（解析后），减少与旧名称的困惑。
- 自动对话 tick 可加互斥锁，避免单次生成超过 interval 时重叠请求。
