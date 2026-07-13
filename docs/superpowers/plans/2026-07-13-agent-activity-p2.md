# Agent Activity P2 — Modern Fluent UI

**日期**：2026-07-13  
**目标**：把 P1 的底部文案升级为更现代、流畅的三层 Activity 体验，并消除空流式气泡困惑。

## 交付

1. **`AgentActivityCard`（层 A）** — 无可见输出时的等待面：墨点动画 + 角色名 + 状态文案；错误态独立展示。
2. **`AgentActivityLine`（层 B）** — 仅在已有可见输出后显示；脉冲指示 + tool 文案；刚完成的 tool step 短提示。
3. **空占位优化** — `stream-*` 空消息不渲染；`room_message` / `final` 时清理空占位。
4. **侧栏指示（层 D）** — 角色行活动圆点（thinking / awaiting / error）。
5. **Store 补强** — `setToolProgress` 提升 deferred 标签；`clearError`；toolSteps 滚动窗口。

## 验收

- Speak → Card「构思」→ tool 标签 / 消息出现 → Line → idle
- 仅 tool、无 delta：无空气泡，以 Card/Line 为主
- Ask 挂起后 resume：Activity 恢复
- 角色列表活动点与当前 `characterId` 对齐
