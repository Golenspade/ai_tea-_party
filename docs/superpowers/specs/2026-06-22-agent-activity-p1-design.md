# Agent Activity P1 设计规格

**日期**：2026-06-22  
**状态**：已批准并实现  
**依据**：[`docs/plans/agent-activity-ui.md`](../plans/agent-activity-ui.md)

## 目标

让用户在 Speak / Ask Resume 期间看到 Agent **正在做什么**（产品级中间态），而不将 Activity 写入 `messages` 表。

## 架构

- **Zustand 跨组件 Store**（`room-activity-store.ts`）：按 `roomId` 分片，对标 OpenWork `session-activity-store`，为 P2 三层 UI 预留共享层。
- **SSE 双轨**：`processSseEvent` 同时更新 Activity Store 与既有副作用（消息/形势栏/Ask）。
- **底部 `AgentActivityLine`**：显示 `currentToolLabel` 或状态默认文案（构思/落笔）。
- **后端 P1.5**：`tool-execution-events.ts` 共享 helper，主流程与 Resume 路径一致发出 `tool_call_*`。

## 状态机（MVP）

`idle | thinking | acting | streaming | awaiting_user | error`

- `startRun`：乐观 thinking（Speak / Ask Resume 点击瞬间）
- `setTool` / `clearTool`：tool 中间态；args 空时 defer 标签
- `markVisibleOutput`：delta / room_message / patch / bar
- `setAwaitingUser` / `setError` / `endRun`：结束或挂起

## 明确不做（P1）

- `AgentActivityCard`、侧边栏指示点、`RoundActivityTimeline`
- Auto-Dialogue 的 Activity（后端无前端 SSE，P2 经 WS 扩展）
- `thinking_*` SSE

## 测试

- 前端：`tool-activity.test.ts`、`room-activity-store.test.ts`
- 后端：`tool-execution-events.test.ts`
