# E2E Skill：Playwright 冒烟 / 全栈 live 回归

## 目标
验证前端聊天界面与后端能力的端到端闭环（真实 REST + WebSocket；可选真实 LLM）。

## 适用场景
- 变量命令链路回归（`/setvar` → `/getvar` / HUD）
- Variable HUD（displays API、WS `variable_update`）
- 前后端联调冒烟
- 有 API Key 时的真实对话 / Agent 工具改值

## 前置条件
- 后端服务可用（默认 `http://127.0.0.1:3004`）
- 前端依赖安装完成（`frontend/`）
- Playwright Chromium 已安装
- （可选）仓库根 `.env` 配置 `DEEPSEEK_API_KEY` 或 `GEMINI_API_KEY`，并**重启 backend**

## 执行步骤

### 1. 仅冒烟（真实后端）

```bash
# 终端 A
pnpm --filter ai-tea-party-backend dev

# 终端 B
cd frontend
npx playwright install chromium   # 首次
npm run e2e:smoke
```

### 2. 全栈 live（推荐）

不 mock API；Playwright 自动拉起 frontend `:3001`，对接 backend `:3004`。

```bash
pnpm --filter ai-tea-party-backend dev   # 保持运行
bash scripts/e2e-live.sh
# 或
pnpm --filter ai-tea-party-frontend e2e:live
```

包含：rooms / presence / websocket / variables smoke、`variable-hud`、dialogue（无 Key 则 skip）、live-llm（无 Key 则 skip）。

### 3. 仅真实 LLM 套件

```bash
# .env 已配置 Key 并重启 backend 后
bash scripts/e2e-live.sh --llm
# 或
pnpm --filter ai-tea-party-frontend e2e:live:llm
```

环境变量：
| 变量 | 含义 |
|------|------|
| `E2E_LIVE=1` | 全栈 live 模式（默认脚本已设） |
| `E2E_LIVE_LLM=0` | 强制跳过 LLM 用例 |
| `E2E_API_BASE_URL` | 后端地址，默认 `http://127.0.0.1:3004` |
| `DEEPSEEK_API_KEY` / `GEMINI_API_KEY` | 启用 dialogue + Agent→HUD 用例 |

## 行为说明
- `e2e:live` 排除 `ask-mermaid` / `patch-room` 等 **page.route mock** 用例。
- Variable HUD 断言：右侧 `data-testid=variable-hud-*`；显式 `variable_displays` 中文标签（如「危险」）。
- LLM 用例在缺少 Key 时 `test.skip`，不会失败。

## 故障排查
- `ECONNREFUSED`：确认 backend 已启且 `curl localhost:3004/api/health` 正常
- LLM timeout：检查 `.env` Key、provider 设置、egress 是否可达 API
- `browserType.launch` 失败：`npx playwright install chromium`

## 维护建议
- 新增「必须真后端」的用例放 `*.spec.ts`，并加入 `e2e:live` 文件列表
- 纯 UI mock 用例继续用 `page.route`，不要混入 `e2e:live`
