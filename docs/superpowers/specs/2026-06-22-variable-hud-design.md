# Variable HUD（Galgame 状态仪表）设计规格

**日期**：2026-06-22  
**状态**：已批准  
**实现路径**：路径一（契约驱动一体化）  
**关联路线图**：[`docs/plans/agent-platform-roadmap.md`](../plans/agent-platform-roadmap.md) §7.4 演进

## 目标

在支持变量的房间中，于主视图右侧提供 **Galgame / 黄油风格** 的常驻状态 HUD，让玩家直观感知 room 变量（如堕落、淫荡、危险）的当前值与变化幅度；global 变量仍保留在左侧 Variables 面板。

**沉浸方案 D**：右侧常驻 HUD + 变量变化瞬时特效（浮动 delta、gauge 脉冲、强变化 vignette）。

---

## 已锁定产品决策

| 项 | 选择 |
|----|------|
| 展示方案 | D：HUD + 瞬时特效 |
| 配置模式 | C 混合：`variable_displays` 精调 + 数值 room 变量约定兜底 |
| HUD 范围 | 仅 **room** 变量 |
| 实现路径 | 路径一：`shared` schema → 后端 WS → 前端 HUD |

---

## 1. 数值模型：连续存储 + 连续显示 + 离散分支

### 1.1 为何不用离散 bin（箱子）

**不推荐**在变量写入或 HUD 展示层使用离散档位（如 0–20 / 21–40 分箱），原因：

- Roleplay 剧情强度是连续的：Agent 根据当前对白可能 `inc_variable corruption 3` 或 `7`，离散 bin 会丢失粒度。
- 黄油/Gal 的「档位感」应来自 **叙事分支**（World Info / Behavior Rules 的 `gte` 阈值），而非把存储值强行量化。
- 前端动画（`transition-all duration-300`）可在连续数值上呈现平滑档位过渡，感官上接近分档，无需后端分箱。

### 1.2 三层职责划分

| 层 | 模式 | 职责 |
|----|------|------|
| **Agent 写入** | 连续 | `set_variable` / `inc_variable` / `dec_variable` 接受任意有限数字；由 LLM 根据剧情决定 delta |
| **HUD 展示** | 连续 | 在 `[min, max]` 上线性归一化，插值颜色与条宽；超出量程时 **钳位显示、保留真实数值** |
| **叙事分支** | 离散 | 沿用现有 `variable-conditions`（`gte 8` 等）；与 HUD 解耦 |

### 1.3 Agent 如何根据剧情改值

- **不改变现有 Tool 契约**：`inc_variable` / `set_variable` 已存在。
- **Prompt 增强**（`prompt-assembler.ts`）：在 system prompt 中注入 HUD 变量清单与语义说明，例如：「剧情出现明显屈服/堕落描写时，酌情 `inc_variable corruption`（通常 1–10）；轻微暗示用 1–3，重大转折用 5–15。」
- **模板 `variable_displays`** 可提供 `hint` 字段（可选，P1 后补）供 Agent 理解变量含义。
- **验证方式**：见 §8.2 Agent 操作校验（集成测试 + 可选 LLM 冒烟）。

### 1.4 归一化与溢出（前端轻量计算）

后端 **不做** 归一化或颜色计算，仅推送原始 `value` / `previous_value` / `delta`。

前端使用最快路径：

```typescript
function normalizeRatio(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}
```

- **显示条宽 / 颜色**：对 `normalizeRatio` 结果插值（见 §5）。
- **溢出**：`value > max` 时条宽保持 100%，数值标签显示真实值（如 `105`），可选数值旁加 `!` 或描边强调（P1 可选）。
- **下溢**：`value < min` 时条宽 0%，标签显示真实值。
- **非有限数**（`NaN` / `Infinity`）：不进入 HUD，侧栏仍可见供调试。

性能理由：归一化在每个 gauge 每次 render 执行一次纯算术；动画由 CSS `transition` 衔接，后端无需预计算。

---

## 2. 数据模型（`packages/shared`）

### 2.1 `VariableDisplaySchema`

```typescript
VariableDisplaySchema = z.object({
  name: z.string(),                    // room 变量名
  label: z.string().optional(),          // 显示名，默认回退 name
  min: z.number().optional(),            // 默认 0
  max: z.number().optional(),            // 默认 100
  polarity: z
    .enum(["higher_is_worse", "higher_is_better"])
    .optional(),                         // 默认 higher_is_worse
  show_in_hud: z.boolean().optional(),   // 默认 true
  order: z.number().int().optional(),    // HUD 排序，越小越靠上
  hint: z.string().optional(),           // Agent 语义提示（P1 可选）
});
```

`scope` 固定为 room，不在 schema 中暴露（HUD 仅 room）。

### 2.2 混合推断规则（未声明的 room 变量）

当 `variable_displays` 中无对应 `name` 时：

1. 值为有限 `number` → 自动 `show_in_hud: true`
2. 名以 `_pct` 结尾或当前值 ∈ [0, 100] → `min=0, max=100`
3. 否则 → `min=0, max=max(100, value)`
4. `label` → 变量名
5. `polarity` → 名匹配 `/danger|corruption|lust|堕落|淫|危险/i` 则 `higher_is_worse`，否则默认 `higher_is_worse`

显式配置 **优先于** 推断；`show_in_hud: false` 可排除某数值变量。

### 2.3 存储

- `rooms.variable_displays_json`：`VariableDisplay[]` JSON 数组（DB 迁移）
- `template.json` → `rooms[].variable_displays`：`config-bootstrap` 导入
- Archive 导出可携带 `variable_displays`（P2 可选）

### 2.4 合并 API 响应

`GET /api/rooms/:room_id/variable-hud`

```typescript
{
  displays: ResolvedVariableDisplay[];  // 配置 + 推断合并
  values: Record<string, unknown>;      // 当前 room 变量快照
}
```

`ResolvedVariableDisplay` = `VariableDisplay` + `source: "explicit" | "inferred"`。

---

## 3. 后端：实时推送

### 3.1 WebSocket 事件

在 `WsMessageSchema` 新增：

```typescript
{
  type: "variable_update",
  room_id: string,
  scope: "room" | "global",
  name: string,
  value: unknown,
  previous_value?: unknown,
  delta?: number,           // 仅当前后均为有限数字时填充
  op: "set" | "inc" | "dec" | "add" | "delete",
}
```

### 3.2 广播时机

在 `AppState.setVariable` / `addVariable` / `incVariable` / `decVariable` / `deleteVariable` 成功后，经 `room-hub.broadcastVariableUpdate` 推送。

覆盖路径：

- Agent Tools（`orchestrator` runtime）
- 用户 `/setvar` 等宏（`store` message path）
- REST `/api/rooms/:id/variables/*`

`scope === "global"` 时仍广播（供左侧 Variables 面板实时刷新），但 **HUD 忽略 global**。

### 3.3 delta 计算（后端极简）

```typescript
function computeDelta(prev: unknown, next: unknown): number | undefined {
  if (typeof prev !== "number" || typeof next !== "number") return undefined;
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return undefined;
  return next - prev;
}
```

---

## 4. 前端布局

### 4.1 结构

```
┌──────────┬─────────────────────────┬────────────┐
│ 左栏     │      聊天消息区          │ VariableHud │
│ Sidebar  │  RoomStatusBar + Msgs   │  (room)     │
└──────────┴─────────────────────────┴────────────┘
```

- 新组件：`frontend/components/chat/variable-hud-panel.tsx`
- 挂载于 `chat-layout.tsx` 的 `<main>` 内右侧，`w-52`（`sm:w-56`），`border-l border-[var(--theme-border)]`
- **显示条件**：`variable-hud` API 返回 ≥1 个 `show_in_hud` 的 display
- 无 eligible 变量：不渲染，不占宽度

### 4.2 与侧栏分工

| 区域 | 受众 | 内容 |
|------|------|------|
| 右侧 HUD | 玩家 | room 状态只读、Gal 风格 |
| 左侧 Variables | 作者/调试 | CRUD、global、Active Branches |

### 4.3 窄屏（Phase 4.4）

`< md`：HUD 收成聊天区底部横向滚动条或折叠按钮；逻辑与数据层不变。

---

## 5. 视觉规范（统合现有实现）

沿用 **Bookish Sepia** 主题（`globals.css`）：

| Token | 用途 |
|-------|------|
| `--bg` / `#fdfaf5` | HUD 背景 |
| `--text` / `#3b3631` | 标签文字 |
| `--theme-accent` / `#a35d40` | 中性/中间态强调 |
| `--theme-border` / `#e6dec1` | 边框 |
| `--secondary` / `#f1ede3` | 轨道背景（与现有 gauge `#ece6d8` 统一为 `#ece6d8` 或 `--secondary`） |
| `--destructive` / `#c0392b` | 高严重度（`higher_is_worse` 高端） |

### 5.1 Gauge 卡片

- 与 `variables-panel` 列表项一致：`rounded-sm border border-[var(--theme-border)] px-3 py-2 text-xs bg-white`
- 标签：`font-medium text-[var(--text)]`；可选日文/中文竖排感用 `tracking-wide`（P1 视觉微调）
- 轨道：`h-1.5 rounded-full bg-[#ece6d8] overflow-hidden`
- 填充：`transition-all duration-300 ease-out`，颜色由 `getVariableSeverityColor(ratio, polarity)` 决定

### 5.2 颜色插值（连续）

`higher_is_worse`（低→高）：

- t≈0：`#8fbc8f`（淡绿）或 desaturated `#b8c9b0`
- t≈0.5：`#a35d40`（`--theme-accent`）
- t≈1：`#c0392b`（`--destructive`）

`higher_is_better`：色阶反转。

实现：RGB 线性插值两段（0–0.5 accent，0.5–1 destructive），无后端参与。

### 5.3 瞬时特效（Phase 4.3）

触发：`variable_update` 且 `scope === "room"` 且 HUD 展示该 `name`。

1. **浮动 delta**：gauge 旁 `+3 堕落`，1.5s 上移淡出；非数值变化仅标签闪动
2. **gauge 脉冲**：`scaleY(1.15)` 200ms
3. **强变化**：`|delta| >= 10` 或 `>= 0.1 * (max - min)` → 聊天区 `box-shadow` inset vignette 800ms

组件：`variable-change-toast.tsx`（叠加层，不阻塞交互）。

### 5.4 共享工具

抽取 `frontend/lib/variable-viz.ts`：

- `normalizeRatio`
- `getVariableSeverityColor`
- `resolveVariableDisplays`（合并 explicit + inferred）
- 供 `variable-hud-panel` 与 `variables-panel` 复用（Phase 4.4 侧栏 gauge 换色）

---

## 6. 模板示例

```json
{
  "room_variables": [
    { "name": "corruption", "value": 0, "scope": "room" },
    { "name": "lust", "value": 0, "scope": "room" }
  ],
  "variable_displays": [
    {
      "name": "corruption",
      "label": "堕落",
      "min": 0,
      "max": 100,
      "polarity": "higher_is_worse",
      "order": 1,
      "hint": "角色屈从、羞耻或道德沦丧时上升"
    },
    {
      "name": "lust",
      "label": "淫荡",
      "min": 0,
      "max": 100,
      "order": 2
    }
  ]
}
```

更新 `examples/templates/agent-room-basic/template.json` 演示 `danger` display。

更新 `docs/templates/template-authoring.md` 增加 `variable_displays` 章节。

---

## 7. 分期交付（Phase 4.1 – 4.4）

| 阶段 | 代号 | 交付物 | 验收 |
|------|------|--------|------|
| **4.1** | `variable-hud-p0-realtime` | `variable_update` WS；`room-hub` 广播；`store` 全路径挂钩；`VariableHudPanel` + 约定推断；`chat-layout` 布局 | Agent `inc_variable` 后 HUD 无需手动刷新即更新 |
| **4.2** | `variable-hud-p1-schema` | `VariableDisplaySchema`；DB 列；模板/bootstrap；`GET variable-hud`；显式配置优先 | 模板导入后 HUD 显示中文 label 与自定义 max |
| **4.3** | `variable-hud-p1-effects` | 浮动 delta、脉冲、强变化 vignette；`variable-change-toast` | E2E 可见 `+N` 动画 |
| **4.4** | `variable-hud-p2-polish` | 窄屏适配；侧栏 gauge 复用色阶；`template-authoring` 文档；E2E 全链路 | 移动端 HUD 可用；文档完整 |

**PR 策略**：本规格 PR 标注全部阶段；实现按 4.1→4.2→4.3→4.4 顺序提交，每阶段可独立 review merge。

---

## 8. 测试要点（扩展）

### 8.1 数值测试

| 用例 | 期望 |
|------|------|
| 正常递增 | `corruption` 0→15，ratio=0.15，颜色偏绿/中性 |
| 达 max | 100/100，条满，红色（higher_is_worse） |
| 溢出 max | value=120, max=100，条宽 100%，标签 `120` |
| 下溢 min | value=-5, min=0，条宽 0%，标签 `-5` |
| max ≤ min | `normalizeRatio` 返回 0，不抛错 |
| 非数字变量 | 不进入 HUD；`set` 字符串不触发 delta toast |
| delta 非有限 | `previous`/`value` 含 NaN 时 `delta` 省略，仅更新显示 |

**文件**：`frontend/lib/variable-viz.test.ts`、`backend` 广播 payload 单测。

### 8.2 Agent 操作校验

| 用例 | 期望 |
|------|------|
| Tool 可调用 | orchestrator 集成：`inc_variable` / `set_variable` 返回正确 `details` |
| Tool 写库 | SQLite `room_variables` 行更新 |
| WS 发出 | 每次 Tool 写变量后收到 `variable_update` |
| 剧情驱动（集成） | 固定 prompt + mock LLM 或脚本 `debug-generate`：含堕落描写时调用 `inc_variable corruption`（允许人工评审或 snapshot tool_calls） |
| Prompt 注入 | `variable_displays` / room 变量列表出现在 system prompt（`prompt-assembler.test.ts` 扩展） |

### 8.3 闭环验证

| 步骤 | 期望 |
|------|------|
| 1. Agent 改值 | `inc_variable corruption 8` |
| 2. 前端 HUD | 无刷新显示 8；特效（4.3 后）显示 `+8` |
| 3. Agent 重读 | 下一轮 `get_variable` / `list_variables` 返回 8 |
| 4. 分支触发 | `danger>=8` 的 World Info / Behavior Rule 进入 `activeBranches`；侧栏可见 |
| 5. 叙事延续 | 后续 generate 的 system prompt 含高风险规则文本 |

**E2E**：`frontend/e2e/variable-hud.spec.ts`（mock WS 或真实 backend）覆盖 1–2；闭环 3–5 用 backend 集成测试 + 可选 E2E。

---

## 9. 明确不做（本阶段）

- global 变量进入 HUD
- 离散 bin 存储或强制档位对齐
- 后端颜色/归一化预计算
- 玩家直接在 HUD 上编辑变量（仍走左侧/命令）
- 独立 `variable_displays` 编辑 UI（作者改 template 或 REST）

---

## 10. 文件清单（实现参考）

| 文件 | 变更 |
|------|------|
| `packages/shared/src/index.ts` | Schema、WsMessage、`VariableDisplay` 类型 |
| `backend/src/db/schema.ts` | `variable_displays_json` |
| `backend/src/db/client.ts` | 迁移 |
| `backend/src/store.ts` | 广播挂钩 |
| `backend/src/room-hub.ts` | `broadcastVariableUpdate` |
| `backend/src/routes/rest.ts` | `GET variable-hud` |
| `backend/src/services/prompt-assembler.ts` | HUD 变量 hint 注入 |
| `frontend/components/chat/variable-hud-panel.tsx` | 新建 |
| `frontend/components/chat/variable-change-toast.tsx` | 新建（4.3） |
| `frontend/lib/variable-viz.ts` | 新建 |
| `frontend/components/chat/chat-layout.tsx` | 布局 + WS handler |
| `frontend/hooks/use-websocket.ts` | `variable_update` |
| `examples/templates/agent-room-basic/template.json` | 示例 |
| `docs/templates/template-authoring.md` | 文档 |

---

## 11. 下一步

1. 用户审阅本 spec（当前步骤）
2. 调用 `writing-plans` 生成 `docs/superpowers/plans/2026-06-22-variable-hud.md`
3. 按 Phase 4.1 开始实现
