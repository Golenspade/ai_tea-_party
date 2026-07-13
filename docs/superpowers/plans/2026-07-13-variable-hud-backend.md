# Variable HUD — Backend Slice B

**日期**：2026-07-13  
**范围**：`variable_update` WS + store 广播 + 前端接线  
**依赖**：前端 Slice A（PR #8 / `cursor/variable-hud-frontend-f852`）  
**规格**：[`docs/superpowers/specs/2026-06-22-variable-hud-design.md`](../specs/2026-06-22-variable-hud-design.md)

## 评审锁定

1. 契约 **严格跟 Spec**（`VariableUpdatePayload`）  
2. **no-op 不广播**（`changed: false` / 值未变）  
3. Toast 层级留给 4.3（本 PR 无特效）  
4. 与前端分 PR；本 PR = 后端 + WS 前端接线

## 交付

- `packages/shared`：`variable_update` 加入 `WsMessageSchema`
- `backend/src/services/variable-events.ts`：`computeDelta` / `buildVariableUpdatePayload` / `isNoOpVariableChange`
- `room-hub.broadcastVariableUpdate`：room → 单房间；global → 全房间 fan-out（侧栏刷新；HUD 仍忽略 global）
- `store` mutator 挂钩 + `index.ts` notifier
- 前端 `use-websocket` + `chat-layout` merge `roomVariables` / `globalVariables`

## 暂不包含（Phase 4.2+）

- `VariableDisplaySchema` / DB / `GET /variable-hud`
- 变化特效 Toast
