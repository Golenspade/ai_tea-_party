# Agent Activity P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P1 MVP + P1.5 Resume tool SSE — 用户 Speak/Ask 恢复时可见 Agent Activity 底部文案。

**Architecture:** Zustand `room-activity-store` + `processSseEvent` 消费 `tool_call_*`；`AgentActivityLine` 跨组件订阅；后端 `mapToolExecutionToStreamingEvent` 统一主/Resume 路径。

**Tech Stack:** Next.js 15, React 19, Zustand 5, Fastify orchestrator, shared `StreamingEventSchema`

## Global Constraints

- Activity 不入 `messages` 表
- `roomId` 默认 `"default"`
- Tool 文案中文产品向；args 空 defer
- 书卷风 UI：`data-testid="agent-activity-line"`

---

### Task 1: Tool 文案与 Store ✅

**Files:** `frontend/lib/tool-activity.ts`, `frontend/lib/room-activity-store.ts`, `frontend/hooks/use-room-activity.ts`

### Task 2: UI 层 B ✅

**Files:** `frontend/components/chat/agent-activity-line.tsx`, `frontend/components/chat/chat-message-list.tsx`

### Task 3: SSE 接线 ✅

**Files:** `frontend/components/chat/chat-layout.tsx` — `processSseEvent`, 乐观 `startRun`, `consumeSseResponse` 收尾

### Task 4: 后端 P1.5 ✅

**Files:** `backend/src/services/tool-execution-events.ts`, `backend/src/services/orchestrator.ts`

### Task 5: 测试 ✅

**Files:** `*.test.ts` 三处；`pnpm test` + `pnpm lint` 通过
