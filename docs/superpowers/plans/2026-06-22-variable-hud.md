# Variable HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在支持变量的房间主视图右侧提供 Galgame 风格常驻 HUD（仅 room 变量），经 WebSocket 实时反映 Agent/用户改值，并叠加变化瞬时特效。

**Architecture:** `packages/shared` 定义 `VariableDisplay` + `variable_update` WS 契约；后端在变量变更后广播原始值/delta；前端 `variable-viz.ts` 做连续归一化与色阶；`VariableHudPanel` 挂于 `chat-layout` 主区右侧。混合配置：显式 `variable_displays` 优先，数值 room 变量约定推断。

**Tech Stack:** TypeScript monorepo, Fastify + RoomSocketManager, Next.js 15 + React 19, Vitest, Playwright E2E, Drizzle SQLite, Zod (`packages/shared`)

**Spec:** [`docs/superpowers/specs/2026-06-22-variable-hud-design.md`](../specs/2026-06-22-variable-hud-design.md)

## Global Constraints

- HUD **仅 room** 变量；global 仍走左侧 Variables 面板
- 连续存储 + 连续显示；**不做**离散 bin；叙事分支沿用 `variable-conditions`
- 后端 **不做** 归一化/颜色计算；仅推 `value` / `previous_value` / `delta`
- 视觉沿用 Bookish Sepia：`--theme-accent` `#a35d40`、`--destructive` `#c0392b`、`--theme-border` `#e6dec1`、轨道 `#ece6d8`
- 默认 `roomId`：`"default"`
- 实现顺序：**4.1 → 4.2 → 4.3 → 4.4**；每阶段独立可测、可 merge

## File Map

| 文件 | 职责 |
|------|------|
| `packages/shared/src/index.ts` | `VariableDisplaySchema`、`VariableUpdatePayload`、`WsMessage` 扩展 |
| `backend/src/services/variable-events.ts` | `computeDelta`、payload 构造（新建） |
| `backend/src/room-hub.ts` | `broadcastVariableUpdate` |
| `backend/src/store.ts` | 变更前后读值 + 调用 `variableChangeNotifier` |
| `backend/src/index.ts` | 将 notifier 接到 `socketManager` |
| `backend/src/routes/rest.ts` | `GET /variable-hud`、REST 变量路径走 store（自动广播） |
| `backend/src/routes/sse.ts` | `AgentSessionHooks.onVariableUpdate` |
| `backend/src/services/orchestrator.ts` | variable tools 触发 hooks |
| `backend/src/db/schema.ts` + `client.ts` | `variable_displays_json` 列 |
| `backend/src/utils/config-bootstrap.ts` | 模板 `variable_displays` 导入 |
| `frontend/lib/variable-viz.ts` | 归一化、色阶、display 合并推断 |
| `frontend/lib/variable-viz.test.ts` | 数值/溢出单测 |
| `frontend/components/chat/variable-hud-panel.tsx` | 右侧 HUD |
| `frontend/components/chat/variable-change-toast.tsx` | 瞬时特效（4.3） |
| `frontend/components/chat/chat-layout.tsx` | 布局 + WS + API 加载 |
| `frontend/hooks/use-websocket.ts` | `variable_update` 分发 |
| `frontend/services/api.ts` | `fetchVariableHud` |
| `backend/src/services/variable-broadcast.test.ts` | 广播 payload 单测（新建） |
| `backend/src/services/store-variable-hud.test.ts` | 闭环集成（新建） |
| `frontend/e2e/variable-hud.spec.ts` | E2E（4.4） |

---

## Phase 4.1 — `variable-hud-p0-realtime`

### Task 1: Shared 契约 — `variable_update` WS

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `backend/src/services/variable-events.test.ts`（新建，共享类型由 backend 引用）

**Interfaces:**
- Produces: `VariableUpdateOp`, `VariableUpdatePayload`, `WsMessage` 含 `type: "variable_update"`

- [ ] **Step 1: 在 shared 添加 schema**

在 `packages/shared/src/index.ts` 的 `WsMessageSchema` discriminated union 中追加：

```typescript
export const VariableUpdateOpSchema = z.enum(["set", "inc", "dec", "add", "delete"]);

export const VariableUpdatePayloadSchema = z.object({
  type: z.literal("variable_update"),
  room_id: z.string(),
  scope: z.enum(["room", "global"]),
  name: z.string(),
  value: z.unknown(),
  previous_value: z.unknown().optional(),
  delta: z.number().optional(),
  op: VariableUpdateOpSchema,
});

// WsMessageSchema union 中加入 VariableUpdatePayloadSchema 形状的对象
```

导出类型：

```typescript
export type VariableUpdateOp = z.infer<typeof VariableUpdateOpSchema>;
export type VariableUpdatePayload = z.infer<typeof VariableUpdatePayloadSchema>;
```

- [ ] **Step 2: 构建 shared**

```bash
pnpm --filter @ai-party/shared build
```

Expected: 成功，无 TS 错误

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): 添加 variable_update WebSocket 契约"
```

---

### Task 2: 后端 `variable-events` + `room-hub` 广播

**Files:**
- Create: `backend/src/services/variable-events.ts`
- Create: `backend/src/services/variable-events.test.ts`
- Modify: `backend/src/room-hub.ts`

**Interfaces:**
- Consumes: `VariableUpdatePayload` from `@ai-party/shared`
- Produces: `computeDelta(prev, next): number | undefined`, `buildVariableUpdatePayload(...): VariableUpdatePayload`, `RoomSocketManager.broadcastVariableUpdate(roomId, payload)`

- [ ] **Step 1: 写失败测试**

`backend/src/services/variable-events.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildVariableUpdatePayload, computeDelta } from "./variable-events.js";

describe("computeDelta", () => {
  it("returns numeric diff", () => {
    expect(computeDelta(5, 8)).toBe(3);
  });
  it("returns undefined for non-numbers", () => {
    expect(computeDelta("a", 8)).toBeUndefined();
    expect(computeDelta(5, NaN)).toBeUndefined();
  });
});

describe("buildVariableUpdatePayload", () => {
  it("builds room inc payload with delta", () => {
    const payload = buildVariableUpdatePayload({
      roomId: "default",
      scope: "room",
      name: "corruption",
      op: "inc",
      previousValue: 2,
      value: 10,
    });
    expect(payload).toEqual({
      type: "variable_update",
      room_id: "default",
      scope: "room",
      name: "corruption",
      op: "inc",
      previous_value: 2,
      value: 10,
      delta: 8,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认 FAIL**

```bash
pnpm --filter ai-tea-party-backend test -- src/services/variable-events.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

`backend/src/services/variable-events.ts`:

```typescript
import type { VariableUpdateOp, VariableUpdatePayload } from "@ai-party/shared";

export function computeDelta(previous: unknown, next: unknown): number | undefined {
  if (typeof previous !== "number" || typeof next !== "number") return undefined;
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return undefined;
  return next - previous;
}

export function buildVariableUpdatePayload(input: {
  roomId: string;
  scope: "room" | "global";
  name: string;
  op: VariableUpdateOp;
  value: unknown;
  previousValue?: unknown;
}): VariableUpdatePayload {
  const delta = computeDelta(input.previousValue, input.value);
  return {
    type: "variable_update",
    room_id: input.roomId,
    scope: input.scope,
    name: input.name,
    op: input.op,
    value: input.value,
    ...(input.previousValue !== undefined ? { previous_value: input.previousValue } : {}),
    ...(delta !== undefined ? { delta } : {}),
  };
}
```

`backend/src/room-hub.ts` 追加：

```typescript
import type { VariableUpdatePayload } from "@ai-party/shared";

async broadcastVariableUpdate(roomId: string, payload: VariableUpdatePayload): Promise<void> {
  await this.send(roomId, payload);
}
```

- [ ] **Step 4: 运行测试 PASS**

```bash
pnpm --filter ai-tea-party-backend test -- src/services/variable-events.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/variable-events.ts backend/src/services/variable-events.test.ts backend/src/room-hub.ts
git commit -m "feat(backend): variable_update 广播 helper"
```

---

### Task 3: Store 变更通知挂钩

**Files:**
- Modify: `backend/src/store.ts`
- Modify: `backend/src/index.ts`
- Create: `backend/src/services/store-variable-broadcast.test.ts`

**Interfaces:**
- Consumes: `buildVariableUpdatePayload`, `broadcastVariableUpdate`
- Produces: `AppState.setVariableChangeNotifier(fn)`, 所有 variable mutator 调用 notifier

- [ ] **Step 1: 在 AppState 添加 notifier 字段与 setter**

`backend/src/store.ts`（类字段区）：

```typescript
import { buildVariableUpdatePayload } from "./services/variable-events.js";
import type { VariableUpdateOp } from "@ai-party/shared";

private variableChangeNotifier?: (payload: ReturnType<typeof buildVariableUpdatePayload>) => void | Promise<void>;

setVariableChangeNotifier(
  notifier: (payload: ReturnType<typeof buildVariableUpdatePayload>) => void | Promise<void>,
): void {
  this.variableChangeNotifier = notifier;
}

private async emitVariableChange(input: {
  roomId: string;
  scope: "room" | "global";
  name: string;
  op: VariableUpdateOp;
  previousValue?: unknown;
  value: unknown;
}): Promise<void> {
  if (!this.variableChangeNotifier) return;
  await this.variableChangeNotifier(buildVariableUpdatePayload(input));
}
```

- [ ] **Step 2: 改造 `setVariable`**

在 `repository.setRoomVariable` / `setGlobalVariable` **之前**读取 `previousValue`：

```typescript
setVariable(scope: "room" | "global", roomIdOrName: string, name: string, value: unknown): VariableEntry {
  const key = String(name || "").trim();
  if (!key) throw new Error("变量名不能为空");

  if (scope === "global") {
    const previousValue = this.repository.getGlobalVariable(key);
    const result = this.repository.setGlobalVariable(key, value);
    void this.emitVariableChange({
      roomId: roomIdOrName,
      scope: "global",
      name: key,
      op: "set",
      previousValue,
      value: result.value,
    });
    return result;
  }

  const room = this.repository.getRoom(roomIdOrName);
  if (!room) throw new Error("聊天室不存在");
  const previousValue = this.repository.getRoomVariable(roomIdOrName, key);
  const result = this.repository.setRoomVariable(roomIdOrName, key, value);
  void this.emitVariableChange({
    roomId: room.id,
    scope: "room",
    name: key,
    op: "set",
    previousValue,
    value: result.value,
  });
  return result;
}
```

对 `addVariable` / `incVariable` / `decVariable` 同样模式，`op` 分别为 `"add"` / `"inc"` / `"dec"`。

`deleteVariable` 成功时 `op: "delete"`, `value: undefined` 或省略，带 `previousValue`。

- [ ] **Step 3: `index.ts` 接线**

`backend/src/index.ts`：

```typescript
appState.setVariableChangeNotifier(async (payload) => {
  await socketManager.broadcastVariableUpdate(payload.room_id, payload);
});
```

- [ ] **Step 4: 集成测试**

`backend/src/services/store-variable-broadcast.test.ts`：mock notifier，调用 `setVariable` / `incVariable`，断言 payload 含正确 `delta`。

- [ ] **Step 5: 运行测试**

```bash
pnpm --filter ai-tea-party-backend test -- src/services/store-variable-broadcast.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/store.ts backend/src/index.ts backend/src/services/store-variable-broadcast.test.ts
git commit -m "feat(backend): 变量变更后广播 variable_update"
```

---

### Task 4: Orchestrator variable tools → session hooks

**Files:**
- Modify: `backend/src/services/orchestrator.ts`（`AgentSessionHooks` 类型若在此或 store）
- Modify: `backend/src/routes/sse.ts`

**Interfaces:**
- Consumes: store mutators（已自动广播，本任务可选：若 store 已广播则 hooks 可省略；**优先仅 store 单点广播**，避免双发）
- Produces: 确认 Agent Tool 路径经 `runtime.setVariable` → store → notifier

- [ ] **Step 1: 确认 orchestrator runtime 调用 `appState.setVariable`**

检查 `getAgentRuntime` 中 `setVariable` / `incVariable` 等是否走 store（已存在则仅加注释测试）。

- [ ] **Step 2: 写 backend 集成测试**

在 `store-variable-broadcast.test.ts` 增加：模拟 `incVariable("room", "default", "danger", 3)` 后 notifier 收到 `op: "inc"`, `delta: 3`。

- [ ] **Step 3: Commit**（若无代码变更则空 commit 跳过）

---

### Task 5: 前端 `variable-viz` 核心（约定推断）

**Files:**
- Create: `frontend/lib/variable-viz.ts`
- Create: `frontend/lib/variable-viz.test.ts`

**Interfaces:**
- Produces:
  - `normalizeRatio(value: number, min: number, max: number): number`
  - `getVariableSeverityColor(ratio: number, polarity: "higher_is_worse" | "higher_is_better"): string`
  - `inferVariableDisplay(name: string, value: unknown): VariableDisplay | null`
  - `resolveHudDisplays(explicit: VariableDisplay[], roomVariables: VariableEntry[]): ResolvedVariableDisplay[]`

```typescript
export type ResolvedVariableDisplay = VariableDisplay & { source: "explicit" | "inferred" };
```

- [ ] **Step 1: 写失败测试**

`frontend/lib/variable-viz.test.ts` 覆盖 spec §8.1：

```typescript
import { describe, expect, it } from "vitest";
import {
  getVariableSeverityColor,
  inferVariableDisplay,
  normalizeRatio,
  resolveHudDisplays,
} from "./variable-viz";

describe("normalizeRatio", () => {
  it("clamps overflow", () => {
    expect(normalizeRatio(120, 0, 100)).toBe(1);
  });
  it("clamps underflow", () => {
    expect(normalizeRatio(-5, 0, 100)).toBe(0);
  });
  it("returns 0 when max <= min", () => {
    expect(normalizeRatio(50, 100, 100)).toBe(0);
  });
});

describe("inferVariableDisplay", () => {
  it("infers numeric room variable", () => {
    expect(inferVariableDisplay("corruption", 0)).toMatchObject({
      name: "corruption",
      show_in_hud: true,
      min: 0,
      max: 100,
    });
  });
  it("returns null for non-finite number", () => {
    expect(inferVariableDisplay("bad", NaN)).toBeNull();
  });
});

describe("resolveHudDisplays", () => {
  it("prefers explicit over inferred", () => {
    const result = resolveHudDisplays(
      [{ name: "danger", label: "危险", min: 0, max: 50 }],
      [{ name: "danger", value: 8, scope: "room" }],
    );
    expect(result[0]).toMatchObject({ label: "危险", max: 50, source: "explicit" });
  });
});
```

- [ ] **Step 2: 运行 FAIL**

```bash
pnpm --filter ai-tea-party-frontend test -- lib/variable-viz.test.ts
```

- [ ] **Step 3: 实现 `variable-viz.ts`**

```typescript
import type { VariableDisplay, VariableEntry } from "@/lib/types";

export type VariablePolarity = "higher_is_worse" | "higher_is_better";
export type ResolvedVariableDisplay = VariableDisplay & { source: "explicit" | "inferred" };

const WORSE_NAME_RE = /danger|corruption|lust|堕落|淫|危险/i;

export function normalizeRatio(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function interpolateHex(from: string, to: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  return toHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t));
}

const COLOR_LOW_WORSE = "#b8c9b0";
const COLOR_MID = "#a35d40";
const COLOR_HIGH_WORSE = "#c0392b";
const COLOR_LOW_BETTER = "#c0392b";
const COLOR_HIGH_BETTER = "#8fbc8f";

export function getVariableSeverityColor(ratio: number, polarity: VariablePolarity): string {
  const t = Math.min(1, Math.max(0, ratio));
  if (polarity === "higher_is_better") {
    if (t <= 0.5) return interpolateHex(COLOR_LOW_BETTER, COLOR_MID, t / 0.5);
    return interpolateHex(COLOR_MID, COLOR_HIGH_BETTER, (t - 0.5) / 0.5);
  }
  if (t <= 0.5) return interpolateHex(COLOR_LOW_WORSE, COLOR_MID, t / 0.5);
  return interpolateHex(COLOR_MID, COLOR_HIGH_WORSE, (t - 0.5) / 0.5);
}

function defaultPolarity(name: string): VariablePolarity {
  return WORSE_NAME_RE.test(name) ? "higher_is_worse" : "higher_is_worse";
}

function defaultBounds(name: string, value: number): { min: number; max: number } {
  if (name.endsWith("_pct") || (value >= 0 && value <= 100)) {
    return { min: 0, max: 100 };
  }
  return { min: 0, max: Math.max(100, value) };
}

export function inferVariableDisplay(name: string, value: unknown): ResolvedVariableDisplay | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const { min, max } = defaultBounds(name, value);
  return {
    name,
    label: name,
    min,
    max,
    polarity: defaultPolarity(name),
    show_in_hud: true,
    source: "inferred",
  };
}

export function resolveHudDisplays(
  explicit: VariableDisplay[],
  roomVariables: VariableEntry[],
): ResolvedVariableDisplay[] {
  const byName = new Map<string, ResolvedVariableDisplay>();
  const values = new Map(roomVariables.map((v) => [v.name, v.value]));

  for (const item of explicit) {
    if (item.show_in_hud === false) continue;
    const value = values.get(item.name);
    if (value === undefined) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    const bounds = typeof value === "number" ? defaultBounds(item.name, value) : { min: 0, max: 100 };
    byName.set(item.name, {
      name: item.name,
      label: item.label ?? item.name,
      min: item.min ?? bounds.min,
      max: item.max ?? bounds.max,
      polarity: item.polarity ?? defaultPolarity(item.name),
      show_in_hud: true,
      order: item.order,
      hint: item.hint,
      source: "explicit",
    });
  }

  for (const entry of roomVariables) {
    if (byName.has(entry.name)) continue;
    const inferred = inferVariableDisplay(entry.name, entry.value);
    if (inferred) byName.set(entry.name, inferred);
  }

  return [...byName.values()]
    .filter((d) => d.show_in_hud !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: 测试 PASS + Commit**

```bash
pnpm --filter ai-tea-party-frontend test -- lib/variable-viz.test.ts
git add frontend/lib/variable-viz.ts frontend/lib/variable-viz.test.ts
git commit -m "feat(frontend): variable-viz 归一化与 HUD display 推断"
```

---

### Task 6: `VariableHudPanel` + `chat-layout` 布局

**Files:**
- Create: `frontend/components/chat/variable-hud-panel.tsx`
- Modify: `frontend/components/chat/chat-layout.tsx`
- Modify: `frontend/hooks/use-websocket.ts`
- Modify: `frontend/services/api.ts`（4.1 暂用 `fetchRoomVariables` + 本地 `resolveHudDisplays([], roomVars)`）

**Interfaces:**
- Consumes: `resolveHudDisplays`, `normalizeRatio`, `getVariableSeverityColor`
- Produces: `VariableHudPanel({ displays, values, onLocalValueChange? })`

- [ ] **Step 1: 创建 `VariableHudPanel`**

```tsx
"use client";

import type { ResolvedVariableDisplay } from "@/lib/variable-viz";
import { getVariableSeverityColor, normalizeRatio } from "@/lib/variable-viz";

interface VariableHudPanelProps {
  displays: ResolvedVariableDisplay[];
  values: Record<string, unknown>;
}

export function VariableHudPanel({ displays, values }: VariableHudPanelProps) {
  if (displays.length === 0) return null;

  return (
    <aside
      className="w-52 sm:w-56 shrink-0 border-l border-[var(--theme-border)] bg-[#fdfaf5] px-3 py-4 overflow-y-auto"
      data-testid="variable-hud-panel"
    >
      <h2 className="text-xs uppercase tracking-[0.1em] text-[var(--theme-accent)] font-semibold mb-3 px-1">
        状态
      </h2>
      <ul className="space-y-2">
        {displays.map((display) => {
          const raw = values[display.name];
          const numeric = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
          const min = display.min ?? 0;
          const max = display.max ?? 100;
          const ratio = normalizeRatio(numeric, min, max);
          const color = getVariableSeverityColor(ratio, display.polarity ?? "higher_is_worse");
          return (
            <li
              key={display.name}
              className="rounded-sm border border-[var(--theme-border)] px-3 py-2 text-xs bg-white"
              data-testid={`variable-hud-${display.name}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-[var(--text)] truncate">{display.label ?? display.name}</p>
                <p className="text-[var(--theme-accent)] tabular-nums">{String(raw ?? "")}</p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#ece6d8] overflow-hidden">
                <div
                  className="h-full transition-all duration-300 ease-out"
                  style={{ width: `${ratio * 100}%`, backgroundColor: color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 2: `chat-layout.tsx` 接线**

- `useMemo`：`hudDisplays = resolveHudDisplays([], roomVariables)`
- `hudValues`：从 `roomVariables` 建 `Record`
- 将 `<main>` 改为 `flex flex-row`：内层 `flex-1 flex flex-col`（原聊天区）+ `<VariableHudPanel />`
- WS handler：`variable_update` 且 `scope==="room"` 时更新 `roomVariables` state（merge by name）
- `use-websocket.ts` 透传 `variable_update` 类型

- [ ] **Step 3: 手动验证**

```bash
pnpm dev
# /setvar danger 12 → 右侧 HUD 出现 danger 条，无需点刷新
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/chat/variable-hud-panel.tsx frontend/components/chat/chat-layout.tsx frontend/hooks/use-websocket.ts
git commit -m "feat(frontend): VariableHudPanel 与 variable_update WS 接线"
```

---

### Task 7: Phase 4.1 验收

- [ ] **运行全量测试**

```bash
pnpm test && pnpm lint
```

- [ ] **验收清单**

- Agent `inc_variable` 或 `/incvar danger 3` 后 HUD 实时更新
- 无 room 数值变量时 HUD 不显示
- global 变量变更不更新 HUD（但侧栏可在后续接 WS 刷新）

- [ ] **Commit / PR 标题建议**

`feat: Variable HUD Phase 4.1 — WS 实时 + 右侧 HUD`

---

## Phase 4.2 — `variable-hud-p1-schema`

### Task 8: Shared `VariableDisplaySchema`

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 添加 schema 与类型**

```typescript
export const VariablePolaritySchema = z.enum(["higher_is_worse", "higher_is_better"]);

export const VariableDisplaySchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  polarity: VariablePolaritySchema.optional(),
  show_in_hud: z.boolean().optional(),
  order: z.number().int().optional(),
  hint: z.string().optional(),
});

export const VariableHudResponseSchema = z.object({
  displays: z.array(VariableDisplaySchema.extend({ source: z.enum(["explicit", "inferred"]) })),
  values: z.record(z.unknown()),
});

export type VariableDisplay = z.infer<typeof VariableDisplaySchema>;
export type VariableHudResponse = z.infer<typeof VariableHudResponseSchema>;
```

- [ ] **Step 2: `pnpm --filter @ai-party/shared build` + Commit**

---

### Task 9: DB 迁移 + Repository

**Files:**
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/src/db/client.ts`
- Modify: `backend/src/db/repository.ts`

- [ ] **Step 1: `rooms` 表加列**

```typescript
variableDisplaysJson: text("variable_displays_json").notNull().default("[]"),
```

`client.ts` 迁移：

```sql
ALTER TABLE rooms ADD COLUMN variable_displays_json TEXT NOT NULL DEFAULT '[]';
```

- [ ] **Step 2: Repository 方法**

```typescript
getRoomVariableDisplays(roomId: string): VariableDisplay[]
setRoomVariableDisplays(roomId: string, displays: VariableDisplay[]): void
```

JSON parse 用 `VariableDisplaySchema.array().safeParse`，失败返回 `[]`。

- [ ] **Step 3: Commit**

---

### Task 10: `GET /api/rooms/:room_id/variable-hud`

**Files:**
- Modify: `backend/src/routes/rest.ts`
- Modify: `backend/src/store.ts`
- Create: `backend/src/services/variable-hud-resolver.ts`（服务端版 `resolveHudDisplays`，与前端逻辑对齐或共享）

**Interfaces:**
- Produces: `GET /api/rooms/:room_id/variable-hud` → `VariableHudResponse`

- [ ] **Step 1: 实现 resolver（复制 frontend 逻辑到 backend 或抽到 `packages/shared` 纯函数）**

推荐：`packages/shared/src/variable-hud.ts` 导出 `resolveHudDisplays`，前后端共用。

- [ ] **Step 2: REST 端点**

```typescript
app.get("/api/rooms/:room_id/variable-hud", (request, reply) => {
  const roomId = request.params.room_id;
  if (!appState.getRoom(roomId)) return sendFailure(reply, 404, "聊天室不存在");
  return appState.getVariableHud(roomId);
});
```

- [ ] **Step 3: 测试 + Commit**

---

### Task 11: 模板 bootstrap + 示例

**Files:**
- Modify: `backend/src/utils/config-bootstrap.ts`
- Modify: `backend/src/utils/config-loader.ts`（`ConfigRoom` 加 `variable_displays?`）
- Modify: `examples/templates/agent-room-basic/template.json`
- Modify: `frontend/services/api.ts` — `fetchVariableHud`
- Modify: `frontend/components/chat/chat-layout.tsx` — 用 API 替代纯本地推断

`template.json` 追加：

```json
"variable_displays": [
  {
    "name": "danger",
    "label": "危险",
    "min": 0,
    "max": 100,
    "polarity": "higher_is_worse",
    "order": 1
  }
]
```

- [ ] **验收：** 新 bootstrap 房间 HUD 显示中文「危险」

- [ ] **Commit:** `feat: Variable HUD Phase 4.2 — variable_displays schema + API`

---

### Task 12: Prompt 注入 HUD 变量 hint

**Files:**
- Modify: `backend/src/services/prompt-assembler.ts`
- Modify: `backend/src/services/prompt-assembler.test.ts`

- [ ] **Step 1: 在 system prompt 追加段落**

```typescript
function formatVariableHudHints(displays: VariableDisplay[]): string {
  if (!displays.length) return "";
  const lines = displays
    .filter((d) => d.show_in_hud !== false)
    .map((d) => `- ${d.name}${d.label ? `（${d.label}）` : ""}${d.hint ? `：${d.hint}` : ""}`);
  return `\n## 房间状态变量\n剧情发展时请用 set_variable / inc_variable 更新：\n${lines.join("\n")}\n`;
}
```

- [ ] **Step 2: 测试断言 prompt 含 `danger` hint**

- [ ] **Commit**

---

## Phase 4.3 — `variable-hud-p1-effects`

### Task 13: `variable-change-toast` 组件

**Files:**
- Create: `frontend/components/chat/variable-change-toast.tsx`
- Modify: `frontend/components/chat/chat-layout.tsx`

**Interfaces:**
- Consumes: `VariableUpdatePayload`（room scope）
- Produces: `useVariableChangeEffects(payload, displays)` 返回 `{ toasts, pulseTarget, vignette }`

- [ ] **Step 1: Toast 状态机**

```typescript
export interface VariableChangeToast {
  id: string;
  label: string;
  deltaText: string; // "+3" or ""
  expiresAt: number;
}
```

`chat-layout` 收到 `variable_update` 时 push toast，1.5s 后移除。

- [ ] **Step 2: Gauge 脉冲**

对对应 `data-testid="variable-hud-${name}"` 加 `animate-pulse` 或 `scale-y-110` class 200ms。

- [ ] **Step 3: 强变化 vignette**

当 `delta` 满足 `Math.abs(delta) >= 10 || Math.abs(delta) >= 0.1 * (max - min)`，给聊天区内层加 `variable-vignette-worse` / `variable-vignette-better` class 800ms。

`globals.css`：

```css
.variable-vignette-worse {
  box-shadow: inset 0 0 80px rgba(192, 57, 43, 0.15);
  transition: box-shadow 800ms ease-out;
}
```

- [ ] **Step 4: Commit**

`feat: Variable HUD Phase 4.3 — 变化瞬时特效`

---

## Phase 4.4 — `variable-hud-p2-polish`

### Task 14: 侧栏 gauge 复用色阶

**Files:**
- Modify: `frontend/components/sidebar/variables-panel.tsx`

- [ ] **Step 1:** 将 gauge 条颜色从固定 `#a35d40` 改为 `getVariableSeverityColor(normalizeRatio(...), polarity)`，polarity 用 `inferVariableDisplay`

- [ ] **Step 2: Commit**

---

### Task 15: 窄屏 HUD

**Files:**
- Modify: `frontend/components/chat/variable-hud-panel.tsx`
- Modify: `frontend/components/chat/chat-layout.tsx`

- [ ] **Step 1:** `< md` 时 HUD 改为 `fixed bottom-0 left-0 right-0 h-auto flex-row overflow-x-auto border-t` 横向卡片

- [ ] **Step 2: Commit**

---

### Task 16: 文档

**Files:**
- Modify: `docs/templates/template-authoring.md`
- Modify: `docs/plans/agent-platform-roadmap.md`（Variable HUD 状态 ⏳→✅）

- [ ] **Step 1:** 增加 `variable_displays` 章节与示例

- [ ] **Commit:** `docs: Variable HUD template-authoring`

---

### Task 17: E2E + 闭环集成测试

**Files:**
- Create: `frontend/e2e/variable-hud.spec.ts`
- Modify: `backend/src/services/store-variable-hud.test.ts`

**§8.2 Agent 操作校验：**

```typescript
// store-variable-hud.test.ts
it("inc_variable updates DB and notifier fires", () => { ... });
```

**§8.3 闭环：**

1. `setVariable` corruption 8
2. `getVariableHud` displays 含 corruption=8
3. `evaluateVariableConditions` + `danger>=8` 分支为 true
4. `assembleSystemPrompt` 含高风险规则

**E2E `variable-hud.spec.ts`：**

```typescript
test("HUD shows danger after /setvar", async ({ page }) => {
  // mock 或真实 backend
  await page.getByRole("textbox").fill("/setvar danger 15");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("variable-hud-danger")).toContainText("15");
});
```

4.3 后追加：`expect(page.getByText("+15")).toBeVisible()`（或 delta 文案）

- [ ] **运行**

```bash
pnpm --filter ai-tea-party-frontend e2e -- variable-hud.spec.ts
pnpm test && pnpm lint
```

- [ ] **Commit:** `test: Variable HUD E2E 与闭环集成`

---

## Spec Self-Review（计划 vs 规格）

| Spec 章节 | 计划任务 |
|-----------|----------|
| §1 连续数值模型 | Task 5 `normalizeRatio`；无 bin |
| §2 VariableDisplay | Task 8–11 |
| §3 WS 广播 | Task 1–3 |
| §4 布局 | Task 6 |
| §5 视觉 | Task 5–6, 14 |
| §5.3 特效 | Task 13 |
| §6 模板 | Task 11, 16 |
| §7 分期 4.1–4.4 | 各 Phase 分段 |
| §8 测试 | Task 5, 7, 12, 17 |
| §1.3 Agent prompt | Task 12 |
| 明确不做 global HUD | Global Constraints |

无 TBD 占位；类型名 `ResolvedVariableDisplay`、`VariableHudResponse` 前后一致。

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-variable-hud.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派发独立 subagent，任务间 review，迭代快

**2. Inline Execution** — 本会话按 Task 顺序直接实现，每 Phase 结束设检查点

**Which approach?**
