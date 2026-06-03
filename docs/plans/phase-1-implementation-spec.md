# Phase 1 实施规格

**版本**：v0.1  
**日期**：2026-06-03  
**上级文档**：[agent-platform-roadmap.md](./agent-platform-roadmap.md) §7  

本文档是 Phase 1 的「可施工版」：API、表结构、事件、文件清单、验收标准。

---

## §0 当前基线

| 能力 | 状态 | 关键文件 |
|------|------|----------|
| Pi Agent + 变量 Tool | ✅ | `backend/src/services/orchestrator.ts` |
| write_to_room | ✅ 后端 + 前端 SSE | `write-to-room.ts`, `store.ts` |
| write_to_bar | ✅ | `write-to-bar.ts`, `room_bar` 表 |
| Ask + resume stream | ✅ | `ask-user.ts`, `pending_asks` 表 |
| Status Bar / Ask 侧栏 / gauge / Mermaid buffer | ✅ | 见 §3 |

---

## §1 范围与非目标

**In scope**：Ask、Write Room、Write Bar、Status Bar、Ask 侧栏、变量 gauge、Mermaid buffer spike、wireframe。

**Out of scope**：Patch、Compact、DM 多 Agent、Room 级 model override（Phase 1.5）、REST 全面 audit。

---

## §2 里程碑

| ID | 内容 | 依赖 |
|----|------|------|
| M0 | write_to_room 收尾 | — |
| M1 | room_bar + write_to_bar | M0 |
| M2 | Status Bar UI | M1 |
| M3 | pending_asks + ask_user + resume | M0 |
| M4 | Ask 侧栏 + resume 联调 | M3 |
| M5 | 变量 gauge | — |
| M6 | Mermaid buffer | 并行 |

---

## §3 分项规格

### 3.1 Write to Room

**Tool**：`write_to_room` — `content`, `character_id?`, `sender_type?`（`ai`|`user`|`system`）

**行为**：upsert 到 `messages`；WS `message`；SSE `room_message`。

**Prompt**：`prompt-assembler.ts` 内 `AGENT_TOOL_GUIDANCE` 块。

**REST（调试）**：`POST /api/rooms/:room_id/agent/write-to-room`

### 3.2 Write to Bar

**表 `room_bar`**（每 room 一行 upsert）：

| 列 | 类型 | 说明 |
|----|------|------|
| room_id | TEXT PK | FK rooms |
| content | TEXT | Markdown/纯文本 |
| label | TEXT | 默认「当前形势」 |
| version | INTEGER | 递增 |
| updated_at | TEXT | ISO |

**Tool**：`write_to_bar` — `content`, `label?`

**REST**：`GET /api/rooms/:room_id/bar`

**事件**：SSE + WS `bar_update`

### 3.3 Ask

**表 `pending_asks`**：

| 列 | 说明 |
|----|------|
| id | PK |
| room_id, request_id, character_id, tool_call_id | 关联 |
| question, choices (JSON) | 问题 |
| allow_custom, multiple | 选项 |
| status | pending / resolved / expired |
| answer (JSON) | `{ selected?, custom? }` |
| agent_messages (JSON) | resume 快照 |
| system_prompt | resume 重建 |
| provider, model | resume 模型 |
| created_at, resolved_at | 时间 |

**Tool**：`ask_user` — `question`, `choices[]`, `allow_custom?`, `multiple?`

**端点**：
- `GET /api/rooms/:room_id/asks/pending`
- `POST /api/rooms/:room_id/asks/:ask_id/answer`
- `POST /api/rooms/:room_id/generate/stream/resume` — body `{ ask_id }`

**SSE**：`ask_pending`, `awaiting_user`  
**WS**：`ask_pending`, `ask_resolved`

### 3.4 变量 gauge

数值变量渲染 progress bar；`*_pct` 后缀按 0–100；tool 结束后 refresh variables。

### 3.5 Mermaid buffer

`frontend/lib/markdown-blocks.ts` — fenced block 闭合后再渲染；未完成显示「渲染中…」。

---

## §4 共享协议

| 事件 | 通道 | 载荷 |
|------|------|------|
| room_message | SSE | `{ message }` |
| bar_update | SSE + WS | `{ room_id, content, label, version }` |
| ask_pending | SSE + WS | PendingAsk 摘要 |
| ask_resolved | WS | `{ ask_id, answer }` |
| awaiting_user | SSE | `{ ask_id, request_id }` |
| message | WS | 已有 |

---

## §5 Agent 行为书（Phase 1 最小）

1. 对白、旁白 → `write_to_room`（旁白 `sender_type=system`）
2. 场景摘要 → `write_to_bar`
3. 用户抉择 → `ask_user`
4. Tool 已写入的正文不在 final 重复

---

## §6 测试验收

| 项 | 验收 |
|----|------|
| write_to_room | 单元测试 + debug REST |
| write_to_bar | upsert 测试 + GET bar |
| Ask | answer + resume 集成路径 |
| 前端 | WS/SSE 事件；Status Bar；Ask 侧栏 |
| E2E smoke | 9 项不回归 |

---

## §7 文档分工

| 文件 | 职责 |
|------|------|
| agent-platform-roadmap.md | 产品决策 |
| phase-1-implementation-spec.md | 本文件 |
| wireframes/ | 布局稿 |

---

## §8 开放项

- Locus 名词（P3）
- Room 级 model（Phase 1.5）
- Ask agent_messages 格式随 Pi upstream 演进
