# Wireframe: Status Bar

```
┌─────────────────────────────────────────────────────────────┐
│ 📍 当前形势 · v3                                    [展开] │
│ 夜已深，茶话会中三人仍在讨论 AI 的未来…（Markdown 摘要）      │
└─────────────────────────────────────────────────────────────┘
```

- 数据源：`GET /api/rooms/:id/bar` + WS `bar_update`
- `version` 变化时 subtle highlight 动画（Phase 1: CSS transition）
- 与消息流严格分离；Agent 用 `write_to_bar` 更新
