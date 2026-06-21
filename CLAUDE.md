# AI Tea Party - Claude Code 工作区配置

## 项目概述

AI Tea Party 是一个多角色 AI **叙事 Agent 平台**。用户创建 AI 角色，在聊天室中进行对话；Agent 可通过 Tool 写入房间、询问用户（Ask）、修稿（Patch）、管理变量与 Archive 归档。技术栈为 **TypeScript 全栈 monorepo**（Next.js 前端 + Fastify/Pi Agent 后端）。

## 技术栈

### Monorepo（pnpm workspace）

| 包 | 路径 | 说明 |
|----|------|------|
| 根 | `/` | `pnpm dev` / `test` / `lint` / `build` |
| 后端 | `backend/` | Fastify + Pi Agent + Drizzle |
| 前端 | `frontend/` | Next.js 15 + React 19 |
| 共享 | `packages/shared/` | Zod schema，前后端契约源 |

### 后端（`backend/`）

- **运行时**：Node.js 20+、TypeScript 5
- **框架**：Fastify 4 + `@fastify/cors` + `@fastify/websocket`
- **AI**：Pi Agent（`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`）
- **数据库**：SQLite + Drizzle ORM + better-sqlite3（`data/tea_party.db`）
- **通信**：REST + SSE（流式生成 / Ask resume）+ WebSocket（实时推送）

### 前端（`frontend/`）

- **框架**：Next.js 15 + React 19 + TypeScript 5
- **UI**：shadcn/ui + Tailwind CSS 4
- **测试**：Vitest（单元）、Playwright（E2E，端口 3001）

## 开发环境设置

### 环境要求

- Node.js 20+
- pnpm 10+
- `.env` 中配置 API 密钥（DeepSeek / Gemini 等）

### 快速启动

```bash
pnpm install
# 编辑 .env：DEEPSEEK_API_KEY 或 GEMINI_API_KEY

pnpm dev    # 并行启动 frontend(:3000) + backend(:3004)
```

### 服务地址

- 后端 API：http://localhost:3004（根路径返回 `version: 2.2.0-ts`）
- 前端界面：http://localhost:3000
- E2E 前端：http://localhost:3001

### 常用命令

```bash
pnpm dev                              # 开发
pnpm test                             # backend tsx test + frontend vitest
pnpm lint                             # tsc + eslint
pnpm build                            # 构建各包
pnpm --filter ai-tea-party-backend dev   # 仅后端
pnpm --filter ai-tea-party-frontend dev  # 仅前端
pnpm --filter ai-tea-party-frontend e2e    # Playwright E2E
```

## 项目结构

```
ai_tea-_party/
├── package.json / pnpm-workspace.yaml
├── config.json                 # 聊天室/角色预设
├── .env                        # API 密钥、PORT
├── data/tea_party.db           # SQLite（运行时）
│
├── backend/src/
│   ├── index.ts                # Fastify 入口
│   ├── store.ts                # AppState 业务中枢
│   ├── room-hub.ts             # WebSocket 广播 + presence
│   ├── db/                     # schema + repository
│   ├── routes/                 # rest / sse / ws
│   └── services/               # orchestrator, ask-user, archive-builder, ...
│
├── frontend/
│   ├── app/                    # App Router
│   ├── components/chat/        # 消息、Mermaid、Status Bar
│   ├── components/sidebar/     # 角色、变量、Ask、Archive
│   ├── services/api.ts         # REST 客户端
│   └── hooks/use-websocket.ts  # WS 事件
│
├── packages/shared/src/        # Zod 类型
├── scripts/                    # 如 export-room-template.mjs
└── docs/plans/                 # 路线图与 Phase 计划
```

### Python 遗留代码

Python 后端及 `pyproject.toml` / `uv.lock` 已全部移除。项目为纯 TypeScript monorepo。

## 已实现能力（Phase 1–3）

| 能力 | 后端模块 | 前端 |
|------|----------|------|
| Ask User | `ask-user.ts`, SSE resume | `ask-panel`, `ask-flow.ts` |
| Write to Room/Bar | `write-to-room/bar.ts` | Status Bar, WS `bar_update` |
| Patch Room | `patch-room.ts` | `message-patch.ts`, WS `message_patch` |
| DM 下一发言者 | `dm-orchestrator.ts` | character-list |
| 变量 + 条件分支 | `variables.ts`, `variable-conditions.ts` | `variables-panel` |
| Archive / Compact | `archive-builder.ts`, `summary-compact.ts` | `archive-panel` |
| Mermaid | — | `mermaid-diagram.tsx` |

## 配置文件

### .env

```env
DEEPSEEK_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
HOST=localhost
PORT=3004
```

修改 `.env` 后需**重启 backend**（TS 后端无 Python 时代的 .env 热重载）。

### config.json

预设聊天室与角色；TS 后端通过 `config-bootstrap` 写入 SQLite。

## 调试

- **后端**：Fastify logger → stdout（API、WS、Pi Agent）
- **前端**：Console / Network / WS 面板
- **WS 事件**：`message`, `message_patch`, `ask_pending`, `ask_resolved`, `bar_update`, `dm_next_speaker`, `presence`

### 常见问题

1. **API 失败** — 检查 `.env` 与 `pnpm dev` 是否已启 backend
2. **WS 未连接** — 确认 3004 为 TS 后端（`curl localhost:3004/` 应返回 `AI Tea Party TS API`）
3. **better-sqlite3 报错** — Node 版本变更后 `pnpm install` 重编译原生模块

## 设计原则

1. **契约在 shared**：`packages/shared` 为类型单一来源
2. **Pi Agent 编排**：Fastify 不直接调 LLM HTTP，由 pi-ai 承担
3. **三通道**：REST（CRUD）+ SSE（流式）+ WS（推送）
4. **SQLite 权威 schema**：TS `db/schema.ts` + 增量迁移

## 版本与文档

- 当前 API 版本：**v2.2.0-ts**
- 路线图：[docs/plans/agent-platform-roadmap.md](docs/plans/agent-platform-roadmap.md)
- Phase 3：[docs/plans/phase-3-implementation-plan.md](docs/plans/phase-3-implementation-plan.md)
- E2E：[docs/E2E_TEST_SKILL.md](docs/E2E_TEST_SKILL.md)
