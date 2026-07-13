# AI Tea Party — Agent 平台开发计划

**版本**：v0.3  
**日期**：2026-06-21  
**状态**：Phase 1–3 已交付（v2.2.0-ts）；下文保留产品决策与后续增强方向

---

## 0. 文档目的

本文件同时承担：

1. **功能性计划**：为什么要 Pi Agent、目标能力、数据与 UI 形态。  
2. **开发性计划**：分阶段交付、与上游关系、当前缺口清单。  

依据：2026-06-03 产品评审 8 条评论 + 结构化问答结论。

---

## 1. 核心结论（一句话）

**当前（v2.2.0-ts）**：Pi Agent 驱动的叙事平台已落地 — Ask、Write Room/Bar、Patch、DM 选角、变量分支、Archive/Compact、Template 导出。  
**后续**：段落级 Patch diff、完整 DM Agent、Current Scale 选型、Big Scale 归档策略深化，并与 **Pi Agent 上游** 协同演进为 **云端 Chat Agent Template**。

---

## 2. 为什么要 Pi Agent（而非单纯 Chatbot 后端）

| 能力 | 目标行为 | 当前状态 |
|------|----------|----------|
| **Write to Room** | Agent 通过 Tool 写入房间，前端即时展示 | ✅ Tool + SSE/WS |
| **Modify / Patch** | 删改已有段落，前端带动画 diff | ✅ 整条消息 patch + 高亮；段落级 diff 待增强 |
| **Ask** | 暂停叙事，询问用户剧情走向（侧栏决策） | ✅ 侧栏 + resume stream |
| **变量系统** | 行为影响变量 → 分支剧情；DB + 可视化 | ✅ Tool + Gauge + 条件 World Info / 行为书 |
| **Summary / Compact** | 压缩上下文、选择性落盘，长剧情可持续 | ✅ Archive + deterministic summary |
| **DM Orchestrator** | 像跑团 DM：只调度写手/交互 Agent，不写正文 | ✅ 用户指定 + Auto 选角；完整 DM Agent 待增强 |

**Fastify 不写裸 LLM HTTP** — 正确；HTTP 由 **pi-ai** 承担，我们维护的是 **Agent 编排 + 房间语义 + 持久化**。

---

## 3. 已确认的产品决策（问答汇总）

| 主题 | 决策 |
|------|------|
| **Phase 1 必做** | ① **Ask**（侧栏） ② **Write to Room** ③ **Write to Bar**（外在状态条） |
| **Phase 1 不做** | Patch 动画、Compact、DM 多 Agent 调度（进路线图） |
| **Orchestrator 终态** | **DM only**：只安排写手与交互 Agent，**不写剧情正文** |
| **数据「四书」** | a 世界书 b 角色书/剧情书 c 行为书 d 当前交互内容 — **全部在路线图**；Phase 1 数据侧重 **(d)** |
| **(a) 与现有系统** | 世界书 ≈ 现有 **World Info**（可演进，非从零） |
| **Current Scale 存哪** | **未定** — 文档内保留 2–3 方案对比（见 §6） |
| **跟上游 Pi Agent** | **跟踪 upstream main**，小步适配；作为 Template 形态 |
| **前端下一版形态** | **TBD** — 需 wireframe；App Router 保留 |
| **「测量模块」** | **变量/状态可视化**（跑团数值条等），非性能监控 |
| **Chatbox 参考范围** | **仅配置与持久化形态**（provider/model/本地存储结构） |
| **三通道通信** | REST + SSE + WS **认可**；需补 **图表/Mermaid 块级 Buffer** 审计 |
| **REST 端点** | 暂全面审计 **不做**；有问题再专项 audit |
| **前端 wireframe** | **与 Phase 1 后端并行** 推进 |

### 3.1 产品决策锁定（2026-06-03 第二轮）

#### Ask

- **固定形态：侧栏**（决策面板 A/B/C + 可选自由输入）。  
- 窄屏 fallback（bottom sheet）留 wireframe 阶段再定。

#### Write：双通道

| Tool | 写入目标 | UI 位置 | 典型内容 |
|------|----------|---------|----------|
| **`write_to_room`** | 房间 **消息流**（`messages`） | 正中聊天区 | 剧情对白、角色发言、**旁白**（`sender_type` 区分 system/narrator） |
| **`write_to_bar`** | 房间 **外在状态条**（Current Scale 外围） | 顶/侧 **Status Bar** | 当前情形 Summary、场景状态、非正文叙事 |

- 核心原则：**写哪部分用哪个 Tool** — Agent 不应用 `write_to_room` 写「当前形势摘要」，应使用 `write_to_bar`。  
- Phase 1 数据：`write_to_room` → 现有 `messages`；`write_to_bar` → 新字段/表（如 `room_status` JSON 或 `room_bar` 表），经 WS 广播 `bar_update`。

#### DM 模式与 Speak

终态下 **Speak 演进为「指定下轮发言者」**，DM **不写正文**：

| 模式 | 行为 |
|------|------|
| **(a) 用户显式指定** | 用户通过入口要求 DM 指定某角色发言；**用户与 DM Agent 均可见**该指令（结构化事件进上下文）。 |
| **(b) Auto 对话** | 定时/连续回合中由 **DM Agent** 选择当前应行动的写手/角色，再调度对应 Agent 执行（Write/Speak 流）。 |

- 当前单角色 **Speak** 为过渡态；P2 引入 DM Orchestrator 后替换为上述两种入口。  
- Auto-chat 现有 `setInterval` 随机选角逻辑 → 改为 **DM 决策输出 `next_speaker_id`**。

#### Big Scale

- **第一场景不拍板**；先跟社区实践。  
- 调研结论（2026-06 已完成，原文档已归档）：  
  - 与「Locus」最接近的公开方案为 **Oracle Locus SDK**（Orchestrator/Specialists、 durable thread）。  
  - **建议首发**：按 room **Archive 归档**（消息 + 变量 + Bar + Compact 摘要）— **已在 P3 实现**；**共享设定库** 归入世界书/四书持久化，不作为 Big Scale v1。  
- 若产品所指的 Locus 另有特指（非 Oracle），需在评审中更正名词。

---

## 4. 目标架构（功能视图）

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 前端（大改中）                                       │
│  · Room 消息流 · Status Bar · 侧栏 Ask · 变量 gauge · 稿本/动画(后) │
└───────────────┬───────────────────────────────┬─────────────┘
                │ REST / SSE / WS               │
┌───────────────▼───────────────────────────────▼─────────────┐
│  Fastify TS                                                  │
│  AppState · RoomSocketManager · routes(rest/sse/ws)          │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Orchestrator（演进为 DM）                                    │
│  调度 · 选手 Agent · 不写正文                                  │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Pi Agent (pi-agent-core) + pi-ai                            │
│  Tools: ask · write_room · write_bar · variables · (patch…) │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼──────────────┐  ┌──────────────────────────┐
│  持久化 (SQLite)              │  │  Current / Big Scale      │
│  settings · rooms · messages  │  │  (方案待定 §6)            │
│  variables · world info       │  │                           │
└──────────────────────────────┘  └──────────────────────────┘
```

---

## 5. Room 数据原型：「四书」与分层

### 5.1 四书定义（路线图）

| 书 | 含义 | 与现有代码关系 | 持久化倾向 |
|----|------|----------------|------------|
| **(a) 世界书** | 设定、规则、背景 | `world_info_books` + `WorldInfoScanner` | 持久化 |
| **(b) 角色书 / 剧情书** | 人物卡、情节线、伏笔 | `characters` + 待扩展 plot arcs | 持久化 |
| **(c) 行为书** | Tool 定义、分支规则、可执行动作 | 新建；与 Agent Tool schema 对齐 | 持久化 + 版本 |
| **(d) 当前交互内容** | 本场景正在写的稿本/交互态 | 新建 **Current Scale** | 短期 + 选择性落盘 |

### 5.2 三层 Scale（待选型）

| 层级 | 说明 | 候选方案 |
|------|------|----------|
| **持久化** | 房间、消息、变量、四书中长期部分 | 现有 SQLite + Drizzle ✅ |
| **Current Scale** | 会话内稿本、未提交段落、Ask 中间态 | A. SQLite JSON  B. Pi session  C. 每 room 文件 — **对比后定** |
| **Big Scale** | 大文本、导出、归档、高缓存复用块 | 对象存储 / 文件 / 分块表 — **后续** |

### 5.3 缓存与复用（后续）

- Prompt / 世界书块 / 角色书块的 **稳定前缀** 便于 LLM cache。  
- 与 Pi Agent 上游的 context 策略对齐后再定具体键策略。  

---

## 6. Current Scale 方案对比（待决）

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. SQLite JSON 列** | 与现有 repo 一致；易 REST | 大文档性能；与 Pi message 格式可能重复 |
| **B. Pi Agent session** | 与 upstream 一致；少维护表 | 持久化/多端同步需额外设计 |
| **C. 每 room 文件 (md/json)** | Agent write/patch 自然 | 部署与并发；需文件锁/WS 同步 |

**建议**：Phase 1 Write to Room 先走 **messages 追加**；Current Scale 文档与 **Phase 2 Patch** 一起选型。

---

## 7. Phase 1 实施规格（开发计划）

### 7.1 Ask 工具（侧栏）

- **后端**：Tool `ask_user`：`question`、`choices[]`、`allow_custom?`、`multiple?`。  
- **行为**：挂起 Agent；`waiting_for_user_input` 类事件；用户回答后以 `toolResult` 续跑。  
- **前端**：**侧栏决策面板**（已锁定）；与主聊天区并列，DM/用户均可见 pending 态。  
- **协议**：扩展 `StreamingEvent`：`ask_pending` / `ask_resolved`；WS 同步多端。  

### 7.2 Write to Room（正中消息流）

- **后端**：Tool `write_to_room`：`character_id?`、`content`、`sender_type`（`ai` | `user` | `system`/旁白）。  
- **行为**：追加 `messages` + `broadcastMessage`；**不**再调 LLM。  
- **前端**：`chat-message-list` 展示；旁白用 distinct 样式（system/narrator bubble）。  

### 7.2b Write to Bar（外在状态）

- **后端**：Tool `write_to_bar`：`content`（Markdown 或纯文本）、可选 `label`（如「当前形势」）。  
- **存储**：`room_bar` 或 `rooms.bar_snapshot` JSON；版本号便于 WS diff。  
- **前端**：**Status Bar** 组件（顶栏或侧顶）；与消息流分离；变量 gauge 可邻接展示。  
- **Agent 规则**（写入 system prompt / 行为书）：摘要、场景状态用 `write_to_bar`；剧情对白用 `write_to_room`。  

### 7.3 前端布局（已完成）

- Phase 1 布局已在产品中实现：侧栏 Ask、Status Bar、变量 gauge、DM 指定发言入口。  
- 窄屏 bottom sheet 等响应式增强留后续迭代。

### 7.4 变量测量模块（UI）

- 侧栏或独立 panel：**room/global 变量** 数值条、标签、变更高亮。  
- 与现有 `variables-panel` 演进，而非重写 REST。  

### 7.5 流式 / 图表 Buffer

- **问题**：Mermaid/图表类块需 **Buffer 完整块再渲染**，避免打字机半块乱码。  
- **任务**：审计 `chat-layout.tsx` SSE 解析、`use-typewriter.ts`、消息 markdown 渲染链；在计划中标记为 **Phase 1 并行 tech spike**。  

### 7.6 配置与 Chatbox 调研（已完成）

- 2026-06 已完成 Chatbox provider/model 与持久化形态调研；结论已吸收进当前 `AppState.PROVIDERS` + SQLite settings 设计。  
- 未照搬客户端本地存 Key 模式；API Key 仍仅 `.env`。

---

## 8. Phase 2+ 路线图（功能）

| 阶段 | 主题 | 要点 |
|------|------|------|
| **P2** | Modify/Patch Room | ✅ `patch_room` + `message_patch`；段落级 diff 编辑器留后续增强 |
| **P2** | DM Orchestrator | ✅ 用户指定发言 + Auto 下 DM 选角；完整 DM Agent 留后续增强 |
| **P2** | 四书 (a)(b)(c) 产品化 | ✅ 世界书 + 行为书规则表 + prompt 脚手架 |
| **P3** | Summary / Compact | ✅ Archive 落盘 + deterministic summary |
| **P3** | 变量 → 分支剧情 | ✅ 条件 World Info / 行为书触发 |
| **P3** | Template 化 | ✅ `examples/templates/` + `export-room-template.mjs` + authoring 文档 |
| **持续** | REST audit | 按需端点审查 |
| **持续** | 前端增强 | 窄屏布局、视觉/交互迭代（App Router 保留） |

---

## 9. 与 Pi Agent 上游协同原则

1. **跟踪 upstream main**，小步 bump `@earendil-works/pi-agent-core` / `pi-ai`。  
2. **扩展放 adapter 层**：`backend/src/services/orchestrator.ts`、`tools/`、事件映射；少 fork 上游。  
3. **Tool 命名与语义**优先查 upstream 是否已有 `ask` / file write 类 Tool，再决定 wrap 还是自研。  
4. **Template 目标**：本仓库可抽「最小 Agent Room 宿主」；业务（茶话会、四书）为 sample app。  

---

## 10. 当前实现状态（v2.2.0-ts）

| 项 | 状态 | 说明 |
|----|------|------|
| Pi Agent 接入 generate/stream | ✅ | orchestrator + Agent |
| pi-ai 模型解析 | ✅ | resolve-pi-model |
| 变量 Tool (set/get/list…) | ✅ | room/global + 条件分支 |
| World Info 扫描 | ✅ | 含条件过滤 |
| Presence / WS / SSE | ✅ | 含 Mermaid buffer |
| Ask Tool + 侧栏 UI | ✅ | SSE resume + E2E |
| Write to Room Tool | ✅ | write-to-room.ts |
| Write to Bar + Status Bar | ✅ | room_bar 表 + 顶栏 |
| 变量测量 UI (gauge) | ✅ | variables-panel |
| chart/Mermaid Buffer | ✅ | mermaid-diagram + 未闭合块 buffer |
| Agent Activity UI | ✅ | P1–P2：状态机 + Card/Line + 空占位优化 + 角色活动指示 |
| DM 调度 | ✅ | 用户指定下轮 + Auto DM 选角 |
| Patch Room | ✅ | 整条消息 patch + 高亮 |
| Compact / Summary / Archive | ✅ | archive-builder + summary-compact |
| 行为书规则表 | ✅ | behavior_rules + prompt 注入 |
| Template 导出 | ✅ | export-room-template.mjs + template-authoring |
| Current Scale 存储选型 | ⏳ | Archive 已落地；稿本级 Current Scale 方案仍待定 |
| 完整 DM Agent（独立写手调度） | ⏳ | 后续增强 |
| 段落级 Patch diff | ⏳ | 后续增强 |
| REST 全面 audit | ⏸ | 按需 |

---

## 11. 开放问题（剩余）

| # | 问题 | 状态 |
|---|------|------|
| 1 | Ask 侧栏在窄屏是否改为 bottom sheet | ⏳ 待产品/UX 决策 |
| 2 | ~~`write_to_bar` 存储表结构~~ | ✅ 独立 `room_bar` 表 |
| 3 | 「Locus」是否专指 Oracle Locus SDK | ⏳ 请产品确认名词 |
| 4 | DM 显式指定入口的 UI 文案与快捷键 | ⏳ 可继续打磨 |
| 5 | ~~Ask resume 模式~~ | ✅ 挂起 + `POST generate/stream/resume` 新流 |
| 6 | Current Scale 稿本存储方案（§6 A/B/C） | ⏳ Archive 已解决归档；会话内稿本层仍待定 |

已关闭：Ask 用侧栏；旁白走 write_to_room；DM 指定发言者；wireframe 并行；Big Scale 先调研；bar 独立表；Ask new stream resume。

---

## 12. 相关文档

| 文件 | 内容 |
|------|------|
| `docs/plans/agent-activity-ui.md` | Agent Activity 状态机与 UI 规格（OpenWork 对标） |
| `docs/fixes/2026-06-03-pi-agent-connectivity.md` | Pi Agent 联调修复记录 |
| `docs/templates/template-authoring.md` | 场景预设编写与 Archive 导出 |
| `docs/E2E_TEST_SKILL.md` | Playwright 冒烟/E2E 流程 |

---

## 13. 修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-07-13 | v0.3.2 | Agent Activity P2：Card / 空占位 / 侧栏指示标记为已落地 |
| 2026-06-21 | v0.3.1 | 增加 Agent Activity UI 规格链接与缺口项 |
| 2026-06-21 | v0.3 | Phase 1–3 状态同步至 v2.2.0-ts；清理历史施工/wireframe/调研文档 |
| 2026-06-03 | v0.2 | 锁定 Ask 侧栏、Write Room/Bar、DM 指定发言、wireframe 并行；社区调研 |
| 2026-06-03 | v0.1 | 初稿：8 条评审 + 三轮问答落盘 |
