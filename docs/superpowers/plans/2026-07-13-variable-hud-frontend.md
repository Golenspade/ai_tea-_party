# Variable HUD — Frontend Slice A

**日期**：2026-07-13  
**范围**：仅前端（后端 WS / shared 契约另 PR）  
**规格**：[`docs/superpowers/specs/2026-06-22-variable-hud-design.md`](../specs/2026-06-22-variable-hud-design.md)

## 评审锁定

1. 契约与行为 **严格跟 Spec**，不做额外变更  
2. no-op **不广播**（后端 PR）  
3. Activity 同屏：Toast / Window 用 `--z-toast`，低于房间内容与 chrome 标签  
4. 前后端分 PR；本 PR = 前端

## 交付

- `frontend/lib/variable-viz.ts` — 归一化、色阶、推断、`resolveHudDisplays`
- `frontend/components/chat/variable-hud-panel.tsx` — 右侧只读 HUD
- `chat-layout.tsx` — 房间列 + HUD 轨；`resolveHudDisplays([], roomVariables)`
- `globals.css` — `--z-toast` / `--z-chrome-label` / `--z-room-surface` / `--z-hud`

## 暂不包含（后端 PR）

- `variable_update` shared schema / room-hub / store notifier  
- `use-websocket` 接线  
- `GET /variable-hud` 与 `variable_displays` DB

## 验收

- 有数值 room 变量时右侧出现「状态」HUD  
- 无 eligible 变量时 HUD 不占宽  
- `/setvar` 或侧栏 CRUD 后经现有 `loadVariables` 刷新 HUD  
- 溢出量程显示真实值 + `!`
