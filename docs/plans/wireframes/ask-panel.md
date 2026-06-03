# Wireframe: Ask 侧栏

## Pending

```
┌─ 剧情抉择 ─────────────┐
│ DM 需要你决定：         │
│ 「接下来去哪里？」      │
│                        │
│  ( ) A. 去图书馆       │
│  ( ) B. 回宿舍         │
│  ( ) C. 留在茶话会     │
│                        │
│  [可选] 自由输入: ___  │
│                        │
│      [ 确认选择 ]      │
└────────────────────────┘
```

## Resolved（短暂提示后清空）

```
✓ 已选择：B. 回宿舍
（Agent 续跑中…）
```

## Multiple

- 多选时 checkbox；`multiple: true` 来自 ask_user Tool
