# Phase 3 实施计划：Summary / Compact、变量分支、Template 化

**日期**：2026-06-09  
**状态**：Phase 2 已收尾；P3.1-P3.6 已完成，Phase 3 可收尾  
**上级文档**：[agent-platform-roadmap.md](./agent-platform-roadmap.md) §8  

---

## 1. 当前结论

Phase 3 的三块主线已经完成：

| 优先级 | 模块 | 当前状态 | 本阶段目标 |
|--------|------|----------|------------|
| P0 | Summary / Compact + Archive | ✅ 已实现 | 长对话可持续；房间状态可导出、可归档、可恢复 |
| P1 | 变量 -> 分支剧情 | ✅ 已实现 | 变量可触发 World Info / 行为书片段，形成可测试的剧情分支 |
| P2 | Template 化 | ✅ 已实现 | 抽出可复用 Agent Room sample，并支持从 archive 生成 template |

实际施工顺序已按 **P0 Summary / Compact + Archive -> P1 变量分支 -> P2 Template 化** 完成。P0 先稳定长上下文和 archive 格式，随后 P1/P2 复用同一套变量条件与 archive payload。

### 1.1 当前实施进度

| 子阶段 | 状态 | 说明 |
|--------|------|------|
| P3.1 Archive Snapshot | ✅ 已完成 | shared schema、SQLite 表、archive builder、REST、后端测试 |
| P3.2 Compact Summary | ✅ 已完成 | deterministic summary、compact REST、prompt summary 接入、旧消息不再硬删除 |
| P3.3 Archive/Compact UI | ✅ 已完成 | 侧栏 ArchivePanel、前端 API、Vitest、Playwright E2E |
| P3.4 Variable Conditions | ✅ 已完成 | shared 条件 schema、SQLite 字段、求值服务、WorldInfo scanner、前端 JSON 条件编辑 |
| P3.5 Behavior Rules MVP | ✅ 已完成 | behavior_rules 表、REST、Prompt 注入、Active Branches 预览 |
| P3.6 Template Sample | ✅ 已完成 | sample template、archive export 脚本、authoring 文档、smoke test |

---

## 2. Phase 2 收尾边界

Phase 2 当前已经具备：

- `patch_room`：Agent 可修改 AI/旁白消息，前端接收 `message_patch` 并高亮。
- Mermaid：markdown 代码块可接入 `mermaid` 渲染，未闭合块先 buffer。
- Ask：侧栏可提交 answer，并通过 resume stream 续跑。
- DM next speaker：用户可指定下轮发言者，Auto 下由 DM 选择下一角色。
- 四书提示词脚手架：prompt 已包含世界书、角色/剧情书、行为书、当前交互内容分层；变量上下文作为行为书分支信号进入 prompt。

Phase 2 没有完整做的是：

- Patch 仍是整条消息级替换，不是段落级 diff 编辑器。
- DM 还是轻量选择器，不是完整独立 DM Agent。
- 行为书目前是 prompt scaffolding，没有持久化规则表。

这些可以接受为 Phase 2 收尾状态；完整 rule engine 和 durable context 应进入 Phase 3。

---

## 3. P0：Summary / Compact + Archive

### 3.1 要解决的问题

当前 `messages` 表和 `max_history` 更像短上下文窗口。Phase 3 需要把它改成：

1. **消息原始记录可长期保留或归档**。
2. **Prompt 只带 compact 后的摘要 + 最近尾部消息**。
3. **Archive 可以导出 room 的可恢复快照**。

这里有一个关键风险：现在 `ensureMessageLimit(roomId)` 会删除超出 `max_history` 的旧消息。Phase 3 不应该继续把 `max_history` 当作硬删除上限，而应改成 prompt tail limit 或 compact threshold。

### 3.2 数据模型

新增共享类型：

- `RoomArchiveManifest`
  - `schema_version`
  - `archive_id`
  - `room_id`
  - `created_at`
  - `message_count`
  - `summary_count`
  - `variable_count`
  - `bar_version`
  - `world_info_book_ids`
- `RoomSummary`
  - `id`
  - `room_id`
  - `start_message_id`
  - `end_message_id`
  - `message_count`
  - `summary`
  - `source`: `"llm" | "deterministic"`
  - `created_at`
- `RoomArchive`
  - `manifest`
  - `room`
  - `messages`
  - `summaries`
  - `room_variables`
  - `global_variables`
  - `room_bar`
  - `world_info_books`

新增 SQLite 表：

```sql
CREATE TABLE room_summaries (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  start_message_id TEXT NOT NULL,
  end_message_id TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  summary TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE room_archives (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  file_path TEXT,
  created_at TEXT NOT NULL
);
```

第一版建议 archive 内容写入 `data/archives/{room_id}/{archive_id}.json`，DB 只保存 manifest 和路径。这样 Big Scale v1 不会把大 JSON 全塞进主表，后续迁移到对象存储也容易。

### 3.3 后端服务

新增 service：

- `backend/src/services/archive-builder.ts`
  - `buildRoomArchiveSnapshot(input)`
  - 收集 room、messages、summaries、variables、bar、world_info。
  - 不包含 provider API key，不包含 `.env`。
- `backend/src/services/summary-compact.ts`
  - `selectCompactionRange(messages, options)`
  - `buildDeterministicSummary(messages)`
  - `buildCompactPrompt(messages, roomBar, variables)`
  - 后续可接 LLM summarizer；首版保留 deterministic fallback，保证离线测试稳定。
- `backend/src/services/context-window.ts`
  - `buildPromptContext({ summaries, recentMessages })`
  - PromptAssembler 只需要接收 summaries，不关心 archive 存储细节。

### 3.4 REST API

新增 endpoint：

- `GET /api/rooms/:room_id/summaries`
  - 返回该 room 已生成摘要。
- `POST /api/rooms/:room_id/compact`
  - body: `{ mode?: "dry_run" | "commit", target_messages?: number }`
  - dry run 返回将被压缩的 message range 和预估摘要。
  - commit 写入 `room_summaries`。
- `GET /api/rooms/:room_id/archives`
  - 返回 archive manifest 列表。
- `POST /api/rooms/:room_id/archives`
  - 创建 room archive JSON 文件并写 manifest。
- `GET /api/rooms/:room_id/archives/:archive_id`
  - 返回 archive JSON。

### 3.5 Prompt 接入

`PromptAssemblerInput` 增加：

```ts
summaries?: RoomSummary[];
```

`collectSystemParts` 增加：

```text
[历史摘要 / Compact]
- ...
```

`buildConversationMessages` 改为：

- 历史摘要进入 system message。
- 最近 `N` 条消息保持原格式。
- 不把已 compact 的旧消息重复塞进 prompt。

### 3.6 前端 UI

第一版不做复杂编辑器，只做可用入口：

- Sidebar 新增 `ArchivePanel`
  - `Compact` 按钮。
  - `Archive` 按钮。
  - 最近摘要列表。
  - archive manifest 列表。
- Room 顶栏增加 compact 状态提示：
  - `Compact: 3 summaries`
  - `Archive: last 2026-06-09 21:50`

### 3.7 测试

后端单测：

- archive builder 包含 messages、variables、bar、world_info。
- archive 不包含 API key 和 provider secrets。
- compact range 忽略最近尾部消息。
- 空房间 compact 返回 no-op。
- deterministic summary 对 system/user/ai 消息都可读。

前端单测：

- `ArchivePanel` 正确展示空态、摘要、archive 列表。
- 点击 compact / archive 调用正确 API。

E2E：

- 创建一批 mock messages。
- 点击 Compact，侧栏显示 summary。
- 点击 Archive，列表出现新 archive manifest。

---

## 4. P1：变量 -> 分支剧情

### 4.1 当前基础

已存在：

- 变量工具：`set_variable`、`inc_variable`、`dec_variable`、`list_variables`。
- 变量 UI：Room / Global 变量展示与数值条。
- Prompt 变量上下文：`[变量上下文 / 行为书分支信号]`。
- World Info scanner：按关键词和 position 激活条目。

缺的是结构化条件触发。

### 4.2 数据模型

给 World Info entry 增加可选条件：

```ts
VariableCondition = {
  scope: "room" | "global";
  name: string;
  op: "exists" | "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "includes" | "truthy";
  value?: unknown;
};

WorldInfoEntry.conditions?: VariableCondition[];
WorldInfoEntry.condition_logic?: "AND" | "OR";
```

SQLite 增加：

```sql
ALTER TABLE world_info_entries ADD COLUMN conditions_json TEXT DEFAULT '[]';
ALTER TABLE world_info_entries ADD COLUMN condition_logic TEXT DEFAULT 'AND';
```

### 4.3 条件求值服务

新增：

- `backend/src/services/variable-conditions.ts`
  - `evaluateVariableCondition(condition, context)`
  - `evaluateVariableConditions(conditions, logic, context)`

边界规则：

- 缺失变量：`exists` 为 false；`ne` 可按产品再定，首版建议 false，避免误触发。
- 数值比较：只接受有限 number；字符串数字可解析，但 NaN 不触发。
- `includes`：支持 string 和 array。
- object 比较：只支持 `eq` / `ne` 的 JSON stable compare。

### 4.4 World Info 接入

`WorldInfoScanner.scan(books, scanText, options)` 增加：

```ts
options?: {
  variableContext?: {
    room: Record<string, unknown>;
    global: Record<string, unknown>;
  };
}
```

激活条件变成：

```text
keyword match AND variable condition match
```

`constant` 条目也要遵守 variable condition；否则带条件的常驻条目会绕过分支。

### 4.5 行为书 MVP

行为书第一版不要直接做完整 action engine。先做「条件 -> prompt 片段」：

- `behavior_rules`
  - `id`
  - `room_id`
  - `name`
  - `enabled`
  - `priority`
  - `conditions_json`
  - `prompt_text`
  - `created_at`
  - `updated_at`

PromptAssembler 把激活的 behavior rules 放入：

```text
[行为书命中规则]
- danger >= 8：进入高风险叙事，角色应优先自保并减少玩笑。
```

这样可以先让剧情分支可控、可测试，不急着让规则自动改变量或直接调用 tool。

### 4.6 前端 UI

分两步：

1. World Info dialog 先加 JSON 条件编辑区。
   - 成本低，适合快速验证。
2. 之后再做可视化条件编辑器。
   - scope select
   - variable name input/select
   - op select
   - value input
   - AND/OR segmented control

Variables panel 增加「Active Branches」只读预览：

- 展示当前变量命中的 World Info / behavior rule。
- 先走后端 `GET /api/rooms/:room_id/branches/active`。

### 4.7 测试

后端单测：

- `gt/gte/lt/lte` 数值边界。
- missing variable 不误触发。
- array/string `includes`。
- AND/OR 多条件。
- constant World Info 也遵守条件。

前端单测：

- 条件 JSON 保存和回填。
- Active Branches 空态和命中态。

E2E：

- 设置 `danger = 8`。
- 有条件 World Info 被命中并进入生成 prompt。
- 改为 `danger = 2` 后不命中。

---

## 5. P2：Template 化

Template 化不要抢在 Archive 和变量分支之前做。原因是 template 需要稳定导出格式、room schema 和 sample 数据。

建议目标：

- `examples/templates/agent-room-basic`
  - 最小 room + characters + world_info + behavior_rules。
- `docs/templates/template-authoring.md`
  - 如何写一个新叙事 template。
- `scripts/export-room-template`
  - 从 room archive 生成 template 初稿。
- CI 增加 template smoke。
  - 安装依赖。
  - 导入 sample template。
  - 跑 backend test。

Template repo 独立化可以放到 Phase 3 后半段或 Phase 4，先在本仓库形成 sample template 即可。

---

## 6. 推荐施工顺序

1. **P3.1 Archive Snapshot**
   - 新 shared schema。
   - 新 archive builder。
   - 新 archive REST。
   - 后端单测。
2. **P3.2 Compact Summary**
   - 新 summaries 表。
   - deterministic summary fallback。
   - PromptAssembler 接 summaries。
   - compact REST。
3. **P3.3 Archive/Compact UI**
   - Sidebar panel。
   - API client。
   - Vitest + E2E。
4. **P3.4 Variable Conditions**
   - shared condition schema。
   - DB column。
   - evaluator service。
   - WorldInfoScanner 接入。
5. **P3.5 Behavior Rules MVP**
   - rules 表。
   - REST。
   - prompt injection。
   - active branches preview。
6. **P3.6 Template Sample**
   - 基于 archive export 形成 sample template。
   - 文档和 smoke test。

---

## 7. 验收标准

Phase 3 可以收尾时，应满足：

- 长房间不会因为 `max_history` 直接丢失旧消息。
- 用户可以一键生成 room archive，并下载或重新读取 archive JSON。
- Prompt 中包含历史摘要和最近消息，而不是无限增长的全量消息。
- 变量条件可以稳定触发或关闭 World Info / 行为书内容。
- 有一个最小 template sample 能从干净环境导入并跑通。
- 后端单测、前端单测、关键 E2E、build/lint 全绿。

## 8. 当前验收结果

已完成：

- `max_history` 不再硬删除旧消息；compact 通过 summary 控制 prompt 历史窗口。
- Archive JSON 包含 room、messages、summaries、variables、bar、world_info、behavior_rules。
- WorldInfo 条目支持 `conditions` / `condition_logic`，常驻条目也遵守变量条件。
- Behavior Rule 支持持久化、REST、变量命中后注入 `[行为书命中规则]`。
- Variables panel 展示 Active Branches 空态和命中态。
- `examples/templates/agent-room-basic/template.json` 提供最小 sample。
- `scripts/export-room-template.mjs` 可从 archive 生成 `template.json`。
- `docs/templates/template-authoring.md` 记录模板编写方式。

验证命令：

```bash
npx pnpm@10 --filter ai-tea-party-backend test
npx pnpm@10 --filter ai-tea-party-backend lint
npx pnpm@10 --filter ai-tea-party-frontend test
npx pnpm@10 --filter ai-tea-party-frontend lint
npx pnpm@10 --filter ai-tea-party-frontend build
npx pnpm@10 --filter ai-tea-party-frontend e2e -- e2e/archive-compact.spec.ts
```

浏览器检查：

- `http://localhost:3001` + `http://localhost:3004` 临时服务连通。
- 页面成功加载角色、Archive、Variables、Active Branches 区块。
- Console 仅有 React DevTools 提示和 WebSocket connected。
