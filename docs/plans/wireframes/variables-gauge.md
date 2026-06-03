# Wireframe: 变量 Gauge

```
Room
┌─────────────────────────┐
│ tension_pct    ████░ 72% │
│ mood           "neutral" │
│ score          ██████ 100│
└─────────────────────────┘
```

- `number` + 名称含 `_pct` → 0–100 进度条
- 其他 number → 相对条（max 默认 100 或上次值×1.2）
- string/boolean → 文本展示（现有）
- tool_call_end / stream 结束 → refresh + 短暂高亮变更项
