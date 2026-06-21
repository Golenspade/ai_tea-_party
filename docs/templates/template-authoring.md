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
- `rooms[].world_info_books`: 世界书，可包含 `conditions`。
- `rooms[].behavior_rules`: 行为书规则，命中后进入 prompt。

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
