# Chatbox 配置与持久化调研

**日期**：2026-06-03  
**仓库**：[chatboxai/chatbox](https://github.com/chatboxai/chatbox)（原 `Bin-Huang/chatbox` 已指向同一 org）  
**调研范围**：仅 **provider/model 配置形态**、**本地持久化分层**、**版本迁移**、**备份/导出** — 不评估 Chatbox 的聊天 UI 或 Agent 能力。  
**对照项目**：AI Tea Party（Fastify + SQLite + `config.json` 热重载 + `.env` API Key）

---

## 1. 结论摘要

| 维度 | Chatbox | AI Tea Party（现状） | 可借鉴程度 |
|------|---------|---------------------|------------|
| 产品形态 | Electron / Web / Mobile 客户端 | Web + 服务端持久化 | 形态不同，借鉴「数据模型」而非「存储介质」 |
| API Key | 存在本地 `settings.providers.*.apiKey` | 仅 `.env`，不进 DB | **不照搬** — 我们保持服务端 env |
| Provider/Model | Registry + `providers` 字典 + 会话级 override | `AppState.PROVIDERS` + SQLite `settings` KV | **高** — 可统一 registry 与 per-room 默认 |
| 全局 vs 会话设置 | `Settings` 默认 + `Session.settings` 快照 | 全局 provider/model + room 级角色/World Info | **高** — Phase 1 可为 room 加 `session_settings` |
| 持久化 | 桌面：文件 + IndexedDB 混合 | 单库 SQLite + `config.json` bootstrap | **中** — 借鉴迁移/备份思路 |
| 版本迁移 | `configVersion` 0→14 逐步函数 | 无 schema 版本号 | **中** — 若 settings 结构演进应引入 |
| 备份 | `config.json` 自动滚动备份（最多约 50 份） | 无 | **低优先级** — 运维/导出阶段再加 |
| 导出 | 会话 → Markdown/TXT/HTML | 无 | **低** — 叙事产品后期可做 room 导出 |

**一句话**：Chatbox 是「**客户端优先、配置进本地文件、会话进大容量 KV**」；我们是「**服务端权威 SQLite、密钥不进库**」。最值得抄的是 **Provider Registry + 全局/会话双层 model 设置 + Zod/版本化迁移**，而不是 Desktop 的 File/IndexedDB 拆分。

---

## 2. 仓库与文档入口

| 资源 | 路径 |
|------|------|
| 存储架构说明 | `docs/storage.md`（截至文档编写时标注 v1.17.0，`configVersion` 13；源码 `CurrentVersion = 14`） |
| 桌面配置主文件 | `src/main/store-node.ts` → `{userData}/config.json` |
| 渲染层存储抽象 | `src/renderer/storage/BaseStorage.ts`、`StoreStorage.ts` |
| 设置 Store | `src/renderer/stores/settingsStore.ts`（Zustand + persist + Zod） |
| 类型 / Schema | `src/shared/types/settings.ts`、`types/session.ts` |
| Provider 注册 | `src/shared/providers/registry.ts`、`definitions/*.ts` |
| 数据迁移 | `src/renderer/stores/migration.ts` |
| 会话导出 | `src/renderer/stores/sessionHelpers.ts` → `exportChat()` |

**技术栈**：Electron + Zustand + electron-store + localforage(IndexedDB) + Zod；移动端 Capacitor SQLite。

---

## 3. 存储分层（跨平台）

来源：`docs/storage.md` + `desktop_platform.ts`

### 3.1 桌面端（当前主流）

```
┌─────────────────────────────────────────────────────────────┐
│  Electron userData/                                         │
│  ├── config.json          ← electron-store（见 §4）         │
│  ├── config-backup-*.json ← 自动备份（§7）                  │
│  └── chatbox-blobs/       ← 大文本/解析文件 blob            │
├─────────────────────────────────────────────────────────────┤
│  IndexedDB (localforage name: chatboxstore)                 │
│  ├── chat-sessions-list   ← SessionMeta[] 轻量列表          │
│  ├── session:{uuid}       ← 完整 Session（含 messages）     │
│  ├── myCopilots / 其他 KV                                   │
│  └── （不含 settings/configs/configVersion）                │
└─────────────────────────────────────────────────────────────┘
```

**设计意图**（Chatbox 官方说明）：

- **配置文件**：便于用户备份、手工拷贝、损坏恢复。  
- **IndexedDB**：会话体积大，放文件会导致 `config.json` 膨胀与启动慢。  
- **关键不变量**：桌面端 `settings` / `configs` / `configVersion` **从未**放进 IndexedDB，只走 IPC → `config.json`。

### 3.2 移动端 / Web

| 平台 | Settings/Configs | Sessions |
|------|------------------|----------|
| Mobile | SQLite | SQLite（v1.17 从 IndexedDB 回退 SQLite，稳定性） |
| Web | IndexedDB | IndexedDB |

### 3.3 写入防抖

`StoreStorage.setItem` 对 KV 写入 **debounce 500ms，maxWait 2000ms**，减少 IndexedDB 频繁刷盘。我们 SSE/WS 高频写 message 时可参考「批量/防抖」思路，但叙事消息通常需即时可见，需分字段处理。

---

## 4. `config.json` 结构（桌面 electron-store）

`store-node.ts` 中 `StoreType`：

```typescript
interface StoreType {
  configVersion: number
  settings: Settings      // 见 §5
  configs: Config           // { uuid: string } 设备/安装实例 ID
  lastShownAboutDialogVersion: string
}
```

- **路径**：`app.getPath('userData')/config.json`（macOS 约为 `~/Library/Application Support/<productName>/`）。  
- **损坏恢复**：启动时 JSON parse 失败 → 按时间排序尝试 `config-backup-*.json`。  
- **IPC**：渲染进程通过 `setStoreValue` / `getStoreValue` 读写；仅 `configs` | `settings` | `configVersion` 走文件，其余 key 走 IndexedDB。

---

## 5. Settings / Provider / Model Schema

### 5.1 核心设计：字典化 Provider

**旧版（已迁移）**：扁平字段 `openaiKey`、`deepseekModel`、`aiProvider` …  
**现版（v9→10 迁移）**：

```typescript
settings.providers: Record<string, ProviderSettings>
settings.customProviders?: CustomProviderBaseInfo[]
```

`ProviderSettings`（Zod `ProviderSettingsSchema`）主要字段：

| 字段 | 用途 |
|------|------|
| `apiKey` | 提供商密钥（本地明文） |
| `apiHost` / `apiPath` | 自定义端点 |
| `models[]` | `{ modelId, capabilities, contextWindow, nickname, ... }` |
| `excludedModels` | 黑名单 |
| `oauth` / `activeAuthMode` | OAuth 登录 |
| Azure/Bedrock 等 | `endpoint`, `deploymentName`, `accessKey`, `region` … |

**内置 Provider** 由 `src/shared/providers/definitions/*.ts` 通过 `defineProvider()` 注册，例如 DeepSeek：

```typescript
defineProvider({
  id: ModelProviderEnum.DeepSeek,
  name: 'DeepSeek',
  type: ModelProviderType.OpenAI,
  curatedModelIds: ['deepseek-chat', 'deepseek-reasoner'],
  defaultSettings: { models: [{ modelId: 'deepseek-chat', contextWindow: 128_000, capabilities: ['tool_use'] }, ...] },
  createModel: (config) => new DeepSeek({ apiKey, model, temperature, ... }),
})
```

**自定义 Provider**：`customProviders[]` 存元数据，`providers['custom-provider-{uuid}']` 存密钥与模型列表。

### 5.2 全局默认 vs 会话设置

注释（`settings.ts`）明确：

> Global settings is for **new session default** settings, set to session when session created, **changes will not affect existing sessions**.

| 层级 | 类型 | 典型字段 |
|------|------|----------|
| 全局 | `Settings` + `GlobalSessionSettingsSchema` | `temperature`, `topP`, `maxTokens`, `stream`, `defaultChatModel`, `autoCompaction` |
| 会话 | `Session.settings` / `SessionSettingsSchema` | `provider`, `modelId`, `maxContextMessageCount`, `providerOptions`, `autoCompaction` |

新会话创建时 **拷贝** 全局默认；之后改全局不影响旧会话。

### 5.3 其他值得记的设置块

- **`mcp.servers`**：MCP stdio/http  transport 列表（与我们未来 Pi Tool / MCP 扩展相关）。  
- **`extension`**：webSearch、knowledgeBase 模型、documentParser（平台默认不同）。  
- **`shortcuts`**：全局快捷键（桌面 IPC 注册）。  
- **`autoCompaction` / `compactionThreshold`**：上下文压缩（对标我们路线图 P3 Compact）。  
- **Zod 校验**：`SettingsSchema.parse` 在 persist 的 `partialize` 与 `migrate` 中执行。

### 5.4 settingsStore 持久化细节

- Zustand `persist` + `immer`，storage 适配器走 `platform.setStoreValue`。  
- **内部 migrate version = 2**（快捷键 typo、license 字段、documentParser 平台默认）。  
- 与 **`configVersion`**（应用级 0–14）是 **两套版本号**，勿混淆。

---

## 6. 会话与消息持久化

### 6.1 Key 约定（`StoreStorage.ts`）

| Key | 内容 |
|-----|------|
| `chat-sessions-list` | `SessionMeta[]`（id, name, starred, type, …） |
| `session:{id}` | 完整 `Session` |
| `chat-sessions` | **遗留** — v7→8 前全量数组，迁移后仍可能被 v8→9 修复逻辑读取 |

`StorageKeyGenerator` 还定义 `file:{sessionId}:{msgId}:{uuid}`、`picture:*` 等 blob 键。

### 6.2 Session 模型要点（`types/session.ts`）

- `type`: `'chat' | 'picture'`  
- `messages[]`：`contentParts`  discriminated union（text / image / tool-call / reasoning / info）  
- `threads[]`：同会话多线程  
- `compactionPoints[]`：摘要边界（Compact 产物）  
- `settings`：会话级 provider/model（§5.2）

与我们的 `messages` 表相比：Chatbox **更富结构**（tool-call part、compaction、fork），我们 Phase 1 只需借鉴 **sender 类型 + 元数据**，不必一次搬全 schema。

---

## 7. 备份与恢复

| 机制 | 行为 |
|------|------|
| 自动备份 | 每 **10 分钟** 若距上次备份已过期则复制 `config.json` → `config-backup-{ISO}.json` |
| 保留策略 | 约 **50** 份；30 天前按日合并；近 2 日按小时保留最新 |
| 启动恢复 | 主文件非法 JSON → 从新到旧尝试 backup |
| 手动 | 用户可拷贝 `userData` 目录（官方未做「一键导出全部数据」UI） |

**Blob**：`chatbox-blobs/` 单独目录；`BaseStorage` 注释仍写「这些数据也应该实现导出与导入」— **全量导出未完备**。

---

## 8. 导出能力（现状）

| 类型 | 支持 | 格式 |
|------|------|------|
| 单会话聊天 | ✅ `exportChat(session, scope, format)` | Markdown / TXT / HTML |
| scope | `all_threads` \| `current_thread` | |
| Provider 配置 | ❌ 无专用导出 API | 依赖复制 `config.json` |
| 全站备份 | ❌ 无统一打包 | |

---

## 9. 版本迁移（`configVersion`）

- **`CurrentVersion = 14`**（源码 `migration.ts`）。  
- 两层迁移：  
  1. **Storage 迁移**：旧 backend（localStorage / 全文件）→ 新 backend（IndexedDB / SQLite）。  
  2. **格式迁移**：`migrate_0_to_1` … `migrate_13_to_14` 链式执行，每步 `configVersion++`。  
- **重要迁移**：  
  - **v7→8**：`chat-sessions` 单 key → `chat-sessions-list` + 每 session 一 key（性能）。  
  - **v9→10**：扁平 provider 字段 → `providers` 字典 + 每 session `settings.provider/modelId`。  
  - **v13→14**：picture session → 独立 `ImageGenerationStorage`。

对我们：若未来改 `settings` 表结构或 room JSON schema，应加 **`schema_version` + 增量 migrate**，避免一次性 SQL 大 bang。

---

## 10. 与 AI Tea Party 对照

### 10.1 我们现状（简要）

| 数据 | 存储 | 说明 |
|------|------|------|
| API Key | `.env` | `DEEPSEEK_API_KEY` 等；pi-ai 读取 |
| 全局 provider/model | SQLite `settings` + 内存 `AppState` | `/api/providers`, `/api/model` |
| 房间/角色/消息 | SQLite | `config.json` 仅 bootstrap / 热重载 |
| World Info / Variables | SQLite | 无 Chatbox 对标（叙事向扩展） |

### 10.2 映射关系

| Chatbox | AI Tea Party | 备注 |
|---------|--------------|------|
| `settings.providers` | `AppState.PROVIDERS` + env | 我们 keys 不在 DB |
| `Session.settings` | 暂无 per-room model | 可加 `rooms.settings_json` |
| `chat-sessions-list` + `session:*` | `rooms` + `messages` | 我们已 relational 规范化 |
| `config.json` uuid | 无 | 可选：安装实例 id |
| `configVersion` | 无 | settings 演进时建议加 |
| `autoCompaction` | 路线图 P3 | 参考阈值 0.6 |
| MCP servers in settings | 未实现 | Pi Agent 阶段再定 |

### 10.3 建议采纳（按优先级）

1. **Provider Registry 文档化**  
   - 将 `backend/src/store.ts` 中 `PROVIDERS` 抽成与 Chatbox 类似的 `definitions` + 静态 registry（仍从 env 取 key）。  
   - 模型列表、`context_tokens`、capabilities 与 pi-ai `resolve-pi-model` 别名表对齐。

2. **全局默认 + Room 级 override**  
   - 全局：`settings` 表 `provider`, `model`, `response_length`。  
   - Room：`rooms` 表可选 `provider`, `model_id`（创建 room 时拷贝全局，之后独立）。  
   - 对齐 Chatbox「改全局不影响旧 session」语义。

3. **Settings schema 版本**  
   - 在 SQLite `settings` 增加 `config_schema_version`；小步 migrate 函数（不必 14 步，从 1 开始即可）。

4. **暂不采纳**  
   - 客户端 API Key 入库。  
   - Desktop File + IndexedDB 双存储（除非做 Electron 离线版）。  
   - 完整照搬 Chatbox 会话 `contentParts`（与 Pi Agent message 格式一起设计更合理）。

---

## 11. 开放问题（留给路线图 / 产品）

| # | 问题 | 倾向 |
|---|------|------|
| 1 | Room 级 model 是否在 Phase 1 与 Write/Ask 一起做 | 建议与 wireframe 并行定字段，实现可 Phase 1.5 |
| 2 | 是否提供「导出 room 为 Markdown」 | 可参考 Chatbox `exportChat`，优先级低于 Agent Tool |
| 3 | `config.json` 热重载 vs DB 权威 | 保持 **DB 权威**；config 仅 seed，与 Chatbox 客户端本地权威不同 |
| 4 | MCP 配置放 `.env` 还是 DB | Chatbox 放 settings；我们可放 DB + 管理员 UI，密钥仍 env |

---

## 12. 参考链接

- 仓库：<https://github.com/chatboxai/chatbox>  
- 存储文档：<https://github.com/chatboxai/chatbox/blob/main/docs/storage.md>  
- `store-node.ts`：<https://github.com/chatboxai/chatbox/blob/main/src/main/store-node.ts>  
- `settings.ts` (schema)：<https://github.com/chatboxai/chatbox/blob/main/src/shared/types/settings.ts>  
- `migration.ts`：<https://github.com/chatboxai/chatbox/blob/main/src/renderer/stores/migration.ts>  

---

**状态**：初稿完成；待产品确认 §11 后，可回写 `agent-platform-roadmap.md` §7.6 与 Phase 1 数据字段设计。
