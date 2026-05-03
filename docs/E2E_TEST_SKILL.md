# E2E Skill：Playwright 冒烟回归（变量命令）

## 目标
验证前端聊天界面与后端变量能力的关键端到端闭环。

## 适用场景
- 变量命令链路回归（`/setvar` -> `/getvar`）
- 前后端联调后快速冒烟
- 前端发布前关键功能自检

## 前置条件
- 后端服务可用（默认 `http://127.0.0.1:3004`）
- 前端依赖安装完成（`frontend/` 目录）
- Playwright 浏览器安装完成

## 执行步骤（技能流程）
1. 安装依赖并确保 Playwright 浏览器已安装
   ```bash
   cd frontend
   npm install
   npx playwright install chromium
   ```
2. 运行冒烟测试
   ```bash
   npm run e2e:smoke
   ```
3. （可选）运行完整 E2E 套件
   ```bash
   npm run e2e
   ```

## 行为说明
- `npm run e2e:smoke` 会自动启动前端开发服务器（`http://127.0.0.1:3001`），
  执行 `frontend/e2e/variables.smoke.spec.ts`。
- 断言重点：
  - 输入框与发送按钮可见可用
  - 非法变量命令给出提示
  - `/setvar xxx 12` 后变量列表展示 `xxx`
  - 通过 `{{getvar::xxx}}` 读取变量成功

## 故障排查
- `ECONNREFUSED`：确认后端可用且端口无冲突
- `TimeoutError`：检查前端渲染是否完成、变量列表是否需要交互后才展示
- `browserType.launch` 失败：补充运行 `npx playwright install chromium`

## 维护建议
- 新增变量相关 E2E 案例时，继续放到 `frontend/e2e/`；
- 大型变更后优先更新 `variables.smoke.spec.ts` 为更贴近真实交互路径的用例。
