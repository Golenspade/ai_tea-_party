# AI Tea Party

基于 **Pi Agent** 的多角色 **RolePlay 对话平台**。在聊天室中编排角色、变量与世界书，由 Agent 通过 Tool 推进叙事；支持 Ask 分支、形势栏、归档与可复用的场景预设。

> 项目处于**开发阶段**，当前提供网页版；后续计划 Release 打包，并考虑 Electron 桌面封装。模型接入将复用 **Pi Agent** 的授权流程（含 LiteLLM OAuth 等），无需用户手动粘贴 API Key。

<!-- 后端 -->
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat&logo=fastify&logoColor=white)
![Pi Agent SDK](https://img.shields.io/badge/Pi_Agent_SDK-5C4EE5?style=flat)
![Drizzle](https://img.shields.io/badge/Drizzle-FF6B35?style=flat)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)

<!-- 前端 -->
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=flat)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat)
![SSE](https://img.shields.io/badge/SSE-4A90E2?style=flat)

## RolePlay 能力

- 多角色同场：性格、背景、示例对话可配置
- **Persona**（你的扮演身份）与 **世界书** 注入叙事上下文
- **自动对话**：DM 调度下一发言者，角色轮流推进剧情
- 房间数据本地持久化（SQLite）

### Pi Agent Tool

| Tool | 作用 |
|------|------|
| Write to Room | Agent 写入聊天消息 |
| Write to Bar | 更新顶部形势栏（时间、地点、局势等） |
| Ask | 暂停叙事并向玩家提问，作答后续跑 |
| Patch Room | 修改已有消息（界面高亮） |
| 变量 | 读写房间 / 全局变量，配合分支剧情 |

此外还有：变量条件（世界书 / 行为书按数值触发）、长对话 **Compact**、**Archive** 存档、消息内 **Mermaid** 图表等。

## 项目结构

```
ai_tea-_party/
├── backend/src/          # Fastify + Pi Agent 后端
├── frontend/             # Next.js 界面
├── packages/shared/      # 前后端共享类型
├── config.json           # 内置主题房间预设
├── examples/templates/   # 可分享的场景预设示例
└── docs/                 # 产品与模板说明
```

## 场景预设

**场景预设**是一份「开场设定包」：包含角色、初始变量、世界书与行为规则，方便你一键加载或分享给他人，**不是**整段聊天记录的备份。

- 仓库内提供示例：[`examples/templates/agent-room-basic/`](examples/templates/agent-room-basic/template.json)，可作为跑团 / 互动叙事的起点。
- 你在应用中调教好的房间，可先 **Archive 存档**，再在界面中 **导出为场景预设**（一键导出按钮规划中；导出后可用于备份或分享，无需命令行）。

更详细的预设字段说明见 [`docs/templates/template-authoring.md`](docs/templates/template-authoring.md)（面向进阶作者）。

---

**v2.2.0-ts** · Pi Agent RolePlay 对话平台
