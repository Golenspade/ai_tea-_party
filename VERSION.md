# AI Tea Party v2.1.0

## 版本信息

- **版本号**: 2.1.0
- **发布日期**: 2026-03-09
- **代号**: "LLM Abstraction & Persistence"

## 本次更新亮点

### 🧠 LLM 三层抽象架构

采用 Provider → Orchestrator → Transport 架构，通过 LiteLLM SDK 统一调用所有 LLM 模型。

### 💾 SQLite 数据持久化

聊天室、角色和消息自动保存到 SQLite，重启后自动恢复。

### 🎨 Bookish Sepia 书卷风 UI

全新的学术书卷风界面设计，温暖的色调和精致的排版。

### 📦 前端组件模块化

原 777 行 page.tsx 拆分为 13 个独立模块组件。

### 🔧 架构统一

清理双入口冗余，ChatService 统一使用 Orchestrator 路径。

## 服务端口

- 后端 API: http://localhost:3004
- 前端界面: http://localhost:3001

## 快速开始

```bash
# 安装 Python 依赖（使用 uv）
uv sync

# 安装前端依赖
cd frontend && npm install

# 配置 API 密钥
# 编辑 .env 文件，填入你的 API 密钥

# 启动后端
uv run python main.py

# 启动前端（新终端）
cd frontend && npm run dev
```

访问 http://localhost:3001 开始使用！

## 技术栈

### 后端

- Python 3.12+
- FastAPI + WebSocket + SSE
- LiteLLM（统一 LLM 调用）
- SQLite + aiosqlite（数据持久化）

### 前端

- Next.js 15 + React 19
- TypeScript 5
- shadcn/ui + Tailwind CSS 3
- Lucide Icons

## 兼容性

- Python: 3.10+（推荐 3.12）
- Node.js: 18+
- 现代浏览器（Chrome、Firefox、Safari、Edge）

## 获取帮助

- 查看 CHANGELOG.md 了解详细更新内容
- 查看 README.md 了解完整使用说明

---

**上一版本**: v2.0.0 (2025-10-03)
