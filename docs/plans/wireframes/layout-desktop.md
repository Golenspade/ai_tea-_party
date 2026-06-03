# Wireframe: Desktop 布局

```
+------------------------------------------------------------------+
|  [Index Rerum]                    [Status Bar: 当前形势 ...]      |
+----------+-------------------------------------------+-----------+
| SIDEBAR  |  [presence] [Auto] [rename]               | ASK PANEL |
|          +-------------------------------------------+ (320px)   |
| Roles    |                                           |           |
| Speak    |         MESSAGE STREAM                    | 问题?     |
|          |         (chat bubbles)                    | [A][B][C] |
| Variables|                                           | [提交]    |
| + gauge  |                                           |           |
|          +-------------------------------------------+           |
| Controls |  [输入框]                          [Send] |           |
+----------+-------------------------------------------+-----------+
```

- 左栏 320px：角色、变量（含 gauge）、房间控制
- 中栏 flex：顶 Status Bar + 消息流 + 底输入
- 右栏 280px（有 pending Ask 时展开）：决策面板
- Phase 1 窄屏：Ask 暂用右栏 overlay，bottom sheet 留 P2
