# Template Authoring

Phase 3 template 的目标是把一个可运行的 Agent Room 拆成可复用配置，而不是复制完整聊天历史。

## 文件结构

最小模板放在：

```text
examples/templates/agent-room-basic/template.json
```

推荐字段：

- `schema_version`: 当前为 `1`。
- `template_id`: 稳定 ID。
- `rooms`: 一个或多个房间模板。
- `rooms[].characters`: 初始角色。
- `rooms[].room_variables` / `rooms[].global_variables`: 初始变量。
- `rooms[].variable_displays`: HUD 展示配置（中文 label、量程、极性、hint）。
- `rooms[].world_info_books`: 世界书，可包含 `conditions`。
- `rooms[].behavior_rules`: 行为书规则，命中后进入 prompt。

## 变量与 HUD

房间变量驱动分支与右侧状态条。模板可同时声明初始值与展示：

```json
{
  "room_variables": [
    { "name": "danger", "value": 0, "scope": "room" }
  ],
  "global_variables": [
    { "name": "chapter", "value": 1, "scope": "global" }
  ],
  "variable_displays": [
    {
      "name": "danger",
      "label": "危险",
      "min": 0,
      "max": 100,
      "polarity": "higher_is_worse",
      "order": 1,
      "hint": "威胁升高、冲突升级时递增"
    }
  ]
}
```

- `variable_displays` 仅作用于 **room** 变量 HUD；未声明的有限数值会自动推断展示。
- `polarity`：`higher_is_worse`（默认用于 danger/corruption 等）或 `higher_is_better`。
- Agent 可通过 `set_variable` / `inc_variable` / `dec_variable` / `delete_variable` 等工具改写变量；前端经 WS `variable_update` 实时刷新。
- `global_variables` 会在房间 bootstrap 时写入全局表，可供条件分支引用。

## 条件格式

WorldInfo 条目和 Behavior Rule 共用条件结构：

```json
{
  "scope": "room",
  "name": "danger",
  "op": "gte",
  "value": 8
}
```

支持的 `op`：

```text
exists, eq, ne, gt, gte, lt, lte, includes, truthy
```

`condition_logic` 支持 `AND` / `OR`。缺失变量不会触发 `ne`，避免误命中。

## 从 Archive 生成模板

先在应用内创建 Archive，再运行：

```bash
node scripts/export-room-template.mjs data/archives/<room_id>/<archive_id>.json examples/templates/my-room
```

脚本会写出：

```text
examples/templates/my-room/template.json
```

不传输出目录时，模板 JSON 会输出到 stdout：

```bash
node scripts/export-room-template.mjs data/archives/<room_id>/<archive_id>.json
```

## 编写建议

- 不要把完整 `messages` 作为模板默认内容；模板应描述初始房间，不是恢复存档。
- 把可重复使用的剧情开关写成变量，例如 `danger`、`trust`、`chapter`。
- WorldInfo 适合放设定、地点、人物事实。
- Behavior Rule 适合放行动约束、叙事风格、风险阈值反应。
- 条件规则先保持少量、明确、可测试。
