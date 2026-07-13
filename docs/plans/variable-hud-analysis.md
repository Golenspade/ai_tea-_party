# Variable HUD — 落地分析（相对 main @ Activity P2）

**日期**：2026-07-13  
**基准**：`main`（含 PR #6 Agent Activity P2）  
**规格**：[`docs/superpowers/specs/2026-06-22-variable-hud-design.md`](../superpowers/specs/2026-06-22-variable-hud-design.md)  
**计划**：[`docs/superpowers/plans/2026-06-22-variable-hud.md`](../superpowers/plans/2026-06-22-variable-hud.md)  
**结论一句话**：**规格已批准、实现代码为 0**；变量 CRUD / Agent Tool / 侧栏 gauge 已可用，缺的是 `variable_update` WS、右侧 HUD、`variable_displays` 配置管线。

---

## 1. 完成度总览

| 层 | 状态 | 说明 |
|----|------|------|
| 产品决策 / 设计规格 | ✅ | 路径一锁定：HUD + 瞬时特效；仅 room；混合配置 |
| 实现计划 Phase 4.1–4.4 | ✅ 文档 | 全部 checkbox 未勾；无对应代码 |
| 变量 CRUD（REST / 宏 / Agent Tool） | ✅ | 统一经 `store.ts` → repository |
| 左侧 Variables 简易 gauge | ✅ 过渡态 | `_pct` 或 0–100 数值条；非玩家 HUD |
| `variable_update` WS | ❌ | shared / room-hub / store notifier 均无 |
| `VariableDisplay` / DB 列 / `GET variable-hud` | ❌ | 全无 |
| `VariableHudPanel` + 三栏布局 | ❌ | `chat-layout` 仍为左栏 + 单列 main |
| 变化特效 / 窄屏 / E2E | ❌ | Phase 4.3–4.4 |

**整体就绪度**：后端变量底座 ~70%；HUD 产品能力 ~0–5%；前端可复用基础设施 ~25%。

---

## 2. 现有底座（可直接复用）

### 2.1 后端写路径已收敛（对 4.1 极友好）

所有变更最终进 `AppState.set/add/inc/dec/deleteVariable`：

- REST：`backend/src/routes/rest.ts`
- Agent Tools：`orchestrator.ts` → `getAgentRuntime` → store
- 用户宏：`/setvar` 等 → store

**含义**：Phase 4.1 只需在 store mutator 单点挂钩 notifier → `room-hub.broadcastVariableUpdate`，即可覆盖三条路径，**不必**在 orchestrator / SSE 再广播（否则会双发）。

可对标现有 `bar_update` hooks 模式。

### 2.2 前端已有状态与刷新，但非实时

`chat-layout.tsx`：

- 持有 `roomVariables` / `globalVariables`
- `loadVariables()` 走 REST
- 触发：挂载、侧栏 CRUD、命令消息、SSE `tool_call_end`

`use-websocket.ts` 已处理 `bar_update` 等 9 类事件，**扩展 `variable_update` 成本低**（同回调 ref 模式）。

### 2.3 侧栏 gauge 是 HUD 的视觉原型，不是实现

`variables-panel.tsx` 内联：

- `isGaugeVariable`：比规格更严（仅 `_pct` 或 ∈[0,100]）
- `gaugeBounds`：与计划 `defaultBounds` 接近
- 颜色固定 `#a35d40`，无 polarity / 溢出强调

→ 应用 `variable-viz.ts` 统一后，4.4 再让侧栏复用色阶，避免双源。

---

## 3. 缺口地图（按 Phase）

### Phase 4.1 — 实时 + 右侧 HUD（首片）

| 交付 | 文件 | 侵入性 |
|------|------|--------|
| `VariableUpdatePayload` + WsMessage | `packages/shared/src/index.ts` | 低 |
| `computeDelta` / payload builder | **新建** `backend/src/services/variable-events.ts` | 低 |
| `broadcastVariableUpdate` | `backend/src/room-hub.ts` | 低 |
| mutator 挂钩 + notifier | `backend/src/store.ts`、`index.ts` | 中 |
| `variable-viz` 推断/归一化 | **新建** `frontend/lib/variable-viz.ts` | 低 |
| `VariableHudPanel` | **新建** `frontend/components/chat/variable-hud-panel.tsx` | 低 |
| 三栏布局 + WS 接线 | `chat-layout.tsx`、`use-websocket.ts` | 中 |

**验收**：Agent `inc_variable` 后 HUD 无需手动刷新即更新。

### Phase 4.2 — 配置契约

| 交付 | 缺口 |
|------|------|
| `VariableDisplaySchema` | shared 无 |
| `rooms.variable_displays_json` | schema / client / repository 无 |
| `GET /api/rooms/:id/variable-hud` | rest 无 |
| 模板 + bootstrap | `config-loader` / `config-bootstrap` 极简；**连 `room_variables` 模板字段也未入库** |
| Prompt HUD hint | `prompt-assembler` 仅列原始变量 |

**额外发现**：`examples/templates/.../template.json` 已有 `room_variables`，但运行时 bootstrap **不导入**。4.2 若只加 `variable_displays` 而不补 `room_variables` seed，模板验收会假绿。

### Phase 4.3–4.4

- 浮动 delta / 脉冲 / vignette（注意与 Activity Card 同屏注意力竞争）
- 窄屏底部横条（与 `ChatBottombar` + `pb-40` 争空间）
- 侧栏色阶复用、E2E、template-authoring 文档

---

## 4. 与 Activity P2（已合 main）的交界

| 交界点 | 风险 | 建议 |
|--------|------|------|
| `chat-layout.tsx` | HUD 改 `main` 为 `flex-row` | Activity 留在 `ChatMessageList`；HUD 挂聊天列右侧 sibling |
| `globals.css` | vignette / ink-dot 动画并存 | vignette 只包聊天列，不包 HUD |
| 同屏动画 | Speak 时 Card + 变量 toast | 4.3 toast 贴 gauge；弱化或错峰 |
| 色板 | 两边都用 `#a35d40` / `#c0392b` | 保持 Bookish Sepia，错误态避免双重大红 |

**无硬冲突**；主要是布局宽度（左栏 320 + HUD ~224 + `max-w-3xl`）在 `max-w-[1400px]` 内容器会变紧。

---

## 5. 开放决策（实现前应拍板）

1. **Global 变量 WS 的 `room_id`**：global mutator 当前忽略 room 参数；广播到「当前连接房间」还是「所有房间」？建议：按发起变更的会话 `roomId` 投递；REST global 无 room 时广播到订阅方各自 room 或跳过 HUD（HUD 本就忽略 global）。
2. **no-op 变更**：`inc/dec` `changed: false` 时是否仍广播？建议 **不广播**。
3. **delete payload**：需先读 `previousValue`；`deleteVariable` 现返回 boolean。
4. **首片是否拆 PR**：推荐 **4.1 单独 PR**（可再拆「纯前端 HUD 壳」与「WS 闭环」两片），4.2+ 后续 PR。

---

## 6. Peer Review 摘要（规格 / 计划 / 底座代码）

### 规格优点

- 连续存储 + 前端归一化 + 分支解耦，模型干净。
- 后端不做颜色计算，推送原始值/delta，边界清晰。
- 分期可独立 merge。

### 规格 / 计划风险

- 计划过长（~977 行逐步指令），执行易漂移 → 按 Phase 开短 PR。
- `resolveHudDisplays` 必须进 `packages/shared`，禁止前后端各写一份。
- 推断默认 `higher_is_worse` 过强 → 显式配置优先；推断宜保守。
- `chat-layout` 已重，HUD 应抽 `useVariableHud` hook，避免再堆巨型组件。
- 成人向示例变量名属产品锁定，模板默认可改用中性 `danger` 等。

### 底座代码问题（HUD 接手前）

- 侧栏 `isGaugeVariable` 与 HUD「任意有限 number」不一致 → 统一前两侧表现不同。
- 变量刷新依赖 `tool_call_end` REST，滞后于 `bar_update` 的 WS 体验。
- Agent 无 `delete_variable` tool（仅 REST/宏）— 非阻塞，记一笔即可。

---

## 7. 推荐实施切片

### Slice A — 纯前端壳（可先合，不依赖新后端）

1. `frontend/lib/variable-viz.ts` + 单测  
2. `VariableHudPanel`  
3. `chat-layout` 三栏；`resolveHudDisplays([], roomVariables)`  
4. 验收：侧栏 `/setvar` 或 CRUD 后右侧出现条（仍靠现有 `loadVariables`）

### Slice B — Phase 4.1 实时闭环

5. shared `variable_update`  
6. store notifier + room-hub  
7. `use-websocket` + merge `roomVariables`  
8. 验收：Agent `inc_variable` 无手动刷新

### 其后

- **4.2** schema/API/bootstrap（含 `room_variables` 导入）  
- **4.3** 特效  
- **4.4** 窄屏 + 侧栏色阶 + E2E  

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 初稿：对照 main（Activity P2）与规格/计划做落地分析 |
