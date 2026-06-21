# AI Tea Party v2.2.0-ts

## 版本信息

- **版本号**: 2.2.0-ts
- **Monorepo 包版本**: 2.1.0（根 `package.json`）
- **发布日期**: 2026-06-21
- **代号**: "TypeScript Agent Platform"

## 当前运行状态

| 组件 | 技术 | 启动方式 |
|------|------|----------|
| 后端 | Fastify + Pi Agent + Drizzle + SQLite | `pnpm dev` 或 `pnpm --filter ai-tea-party-backend dev` |
| 前端 | Next.js 15 + React 19 | `pnpm dev` 或 `pnpm --filter ai-tea-party-frontend dev` |
| 共享类型 | `@ai-party/shared`（Zod） | workspace 自动链接 |

**Python 后端已完全移除**（含 `pyproject.toml`、`uv.lock`）。项目为纯 TypeScript monorepo。

## 本次更新亮点

### TypeScript 全栈

- pnpm monorepo：`frontend` + `backend` + `packages/shared`
- 单一后端入口：`backend/src/index.ts`（API 版本标识 `2.2.0-ts`）
- CI：pnpm lint / test / build

### Pi Agent 叙事平台

- **Ask**：侧栏决策 + SSE resume 续跑
- **Write to Room / Bar**：Agent Tool 写入消息与形势栏
- **Patch Room**：修改已有消息
- **DM**：自动聊天下一发言者
- **变量 + 分支**：World Info / 行为书条件、变量 Gauge
- **Archive / Compact**：归档与摘要压缩
- **Mermaid**：消息内图表渲染

## 服务端口

- 后端 API: http://localhost:3004
- 前端界面: http://localhost:3000
- E2E 前端: http://localhost:3001

## 快速开始

```bash
pnpm install

# 编辑 .env，填入 DEEPSEEK_API_KEY 或 GEMINI_API_KEY

pnpm dev
```

```bash
pnpm test    # backend + frontend 单元测试
pnpm lint
pnpm build
```

访问 http://localhost:3000 开始使用。

## 技术栈

### 后端（`backend/`）

- Fastify 4 + `@fastify/cors` + `@fastify/websocket`
- Pi Agent（`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`）
- Drizzle ORM + better-sqlite3 → `data/tea_party.db`
- REST + SSE + WebSocket

### 前端（`frontend/`）

- Next.js 15 + React 19 + TypeScript 5
- shadcn/ui + Tailwind CSS 4
- Vitest + Playwright

## 兼容性

- Node.js: 20+
- pnpm: 10+
- 现代浏览器（Chrome、Firefox、Safari、Edge）

## 相关文档

- [README.md](README.md) — 完整使用说明
- [CLAUDE.md](CLAUDE.md) — 开发工作区配置
- [CHANGELOG.md](CHANGELOG.md) — 版本历史
- [docs/plans/agent-platform-roadmap.md](docs/plans/agent-platform-roadmap.md) — 产品路线图

---

**上一版本**: v2.1.0 (2026-03-09, Python 后端)
