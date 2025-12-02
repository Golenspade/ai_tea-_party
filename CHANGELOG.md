# 更新日志 (Changelog)

## [v2.0.0] - 2025-10-03

### 🎉 重大更新

#### 前端现代化重构
- ✨ **全新 Next.js + shadcn/ui 前端**
  - 使用 React 18 + Next.js 15 重构前端
  - 集成 shadcn/ui 组件库，提供精美的现代化 UI
  - 完整的 TypeScript 支持
  - 响应式设计，支持深色模式
  - 实时 WebSocket 连接状态显示

- 🌏 **完整中文界面**
  - 所有按钮、标签、提示文本中文化
  - 使用 Noto Sans 字体，完美支持中英文显示
  - 优化的阅读体验

#### 配置系统增强
- 📝 **config.json 预设系统**
  - 支持通过 JSON 配置文件预设聊天室和角色
  - 内置 4 个主题聊天室：
    - AI 茶话会（默认）- 4 个角色
    - 哲学沙龙 - 3 个角色（苏格拉底、庄子、康德）
    - 科幻世界 - 3 个角色
    - 创意工坊 - 4 个角色
  - 启动时自动加载预设配置
  - 支持自定义角色卡（名称、性格、背景、说话风格）

- 🔥 **.env 热重载**
  - 实时监测 `.env` 文件变化
  - 自动重新加载 API 配置
  - 无需重启服务器，配置立即生效
  - 实时日志反馈配置状态

- ⚙️ **配置文件优化**
  - 创建 `.env` 模板文件
  - 优化端口配置（后端默认 3004）
  - 完善的配置说明和 API 密钥获取链接

#### 后端优化
- 🔧 **CORS 配置更新**
  - 支持多端口开发（3000, 3001）
  - 优化跨域配置，提升前后端通信稳定性

- 📦 **模块化改进**
  - 新增 `utils/config_loader.py` - 配置加载器
  - 新增 `utils/env_watcher.py` - 环境变量热重载
  - 优化代码结构，提升可维护性

#### 依赖更新
- ⬆️ **Python 依赖**
  - 更新为灵活的版本约束（`>=` 替代 `==`）
  - 兼容 Python 3.14
  - 更新 pydantic, openai, uvicorn 等核心库

- 📚 **前端依赖**
  - Next.js 15.5.4
  - React 19
  - shadcn/ui 组件库
  - TypeScript 5
  - Tailwind CSS 3

### 🐛 Bug 修复
- 修复端口冲突问题（前端使用 3001 端口作为备选）
- 修复 config.json 加载时的异步回调问题
- 优化 WebSocket 连接稳定性

### 📖 文档更新
- 更新 README.md
- 新增 CHANGELOG.md
- 前端添加快速开始文档
- 完善 API 配置说明

### 🔄 迁移指南
从 v1.x 升级到 v2.0:
1. 运行 `npm install` 安装前端依赖
2. 更新 `.env` 文件（参考 `.env.example`）
3. 可选：自定义 `config.json` 配置角色和聊天室
4. 启动服务：
   - 后端：`python main.py` (http://localhost:3004)
   - 前端：`cd frontend && npm run dev` (http://localhost:3001)

---

## [v1.0.0] - 2025-07-21

### 初始版本
- 基本的 AI 聊天室功能
- 支持 DeepSeek 和 Gemini API
- 多角色对话系统
- 自动聊天模式
- WebSocket 实时通信
