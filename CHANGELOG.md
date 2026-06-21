# 更新日志 (Changelog)

## [v2.2.0-ts] - 2026-06-21

### TypeScript 全栈迁移

- **后端切换为 TypeScript**：`backend/`（Fastify + Pi Agent + Drizzle ORM）取代 Python FastAPI 作为唯一运行时后端
- **pnpm monorepo**：根目录 `pnpm dev` 并行启动 frontend + backend；`packages/shared` 提供前后端 Zod 契约
- **移除 Python 入口**：删除 `main.py`；Python 遗留模块（`core/`、`services/` 等）计划逐步清理
- **CI 更新**：GitHub Actions 改为 pnpm lint + TS backend test + frontend Vitest + build（不再跑 Python pytest）

### Agent 平台能力（Phase 1–3）

- **Ask User**：Agent 暂停叙事、侧栏询问用户，SSE resume 续跑
- **Write to Room / Write to Bar**：Agent Tool 写入消息与形势栏
- **Patch Room**：修改已有 AI/旁白消息，前端 `message_patch` 高亮
- **DM Orchestrator**：自动聊天下一发言者调度
- **变量系统**：room/global 变量、条件分支、World Info / 行为书条件过滤
- **Archive / Compact**：房间快照归档、确定性摘要压缩、长对话可持续
- **Mermaid**：聊天消息内 Mermaid 代码块渲染
- **Template 化**：Archive 导出 Agent Room 模板（`scripts/export-room-template.mjs`）

### 前端

- 侧栏：Ask 面板、Archive 面板、变量 Gauge、Status Bar
- 测试：Vitest 单元测试 + Playwright E2E（archive、ask、mermaid、patch、dm 等）

### 文档

- 更新 README、CLAUDE.md、VERSION.md 为 TypeScript 启动说明
- 删除根目录手动 E2E 截图（`e2e-manual-*.png`）

---

## [v2.1.0] - 2026-03-09

### 架构重构（Python 时代，已退役）

> 以下内容为 v2.1.0 历史记录。Python 后端已于 v2.2.0-ts 退役，仅供参考。

#### LLM 三层抽象

- Provider → Orchestrator → Transport 架构
- `core/llm/` + LiteLLMProvider + ChatOrchestrator
- `routes/` REST / SSE / WebSocket 分离

#### 数据持久化

- SQLite（rooms, characters, messages 等）
- 启动时从 DB 恢复，空库时从 config.json 初始化

#### 前端模块化

- page.tsx 拆分为 chat / sidebar / dialogs 组件
- `services/api.ts` + `hooks/use-websocket.ts`

### UI 更新

- Bookish Sepia 书卷风界面

### 依赖

- `litellm>=1.81.0`、`aiosqlite>=0.22.1`

---

## [v2.0.0] - 2025-10-03

### 重大更新

- 全新 Next.js + shadcn/ui 前端
- config.json 预设系统（4 主题聊天室）
- `.env` 热重载（Python 后端时代）
- CORS 多端口支持

### 迁移指南（历史）

v2.0 时代启动方式：

```bash
# 后端（已废弃）
uv run python main.py

# 前端
cd frontend && npm run dev
```

当前请使用：

```bash
pnpm install && pnpm dev
```

---

## [v1.0.0] - 2025-07-21

### 初始版本

- 基本 AI 聊天室、DeepSeek/Gemini API
- 多角色对话、自动聊天、WebSocket 实时通信
