# AI Tea Party v2.0.0

## 版本信息
- **版本号**: 2.0.0
- **发布日期**: 2025-10-03
- **代号**: "Modern UI & Smart Config"

## 本次更新亮点

### 🎨 全新现代化界面
采用 Next.js + shadcn/ui 重构，提供精美的用户体验，完整中文化界面。

### 🤖 智能配置系统
- 预设 4 个主题聊天室，14 个精心设计的 AI 角色
- config.json 快速配置，开箱即用
- .env 热重载，配置修改立即生效

### 🚀 技术升级
- React 19 + Next.js 15
- TypeScript 全面支持
- Python 3.13 兼容
- 实时 WebSocket 通信

## 服务端口
- 后端 API: http://localhost:3004
- 前端界面: http://localhost:3001

## 快速开始
```bash
# 安装 Python 依赖
pip install -r requirements.txt

# 安装前端依赖
cd frontend && npm install

# 配置 API 密钥
# 编辑 .env 文件，填入你的 API 密钥

# 启动后端
python main.py

# 启动前端（新终端）
cd frontend && npm run dev
```

访问 http://localhost:3001 开始使用！

## 技术栈

### 后端
- Python 3.13
- FastAPI 0.118+
- WebSocket
- OpenAI SDK (DeepSeek API)
- Google Generative AI (Gemini)

### 前端
- Next.js 15.5.4
- React 19
- TypeScript 5
- shadcn/ui
- Tailwind CSS 3
- Lucide Icons

## 配置文件说明

### .env - 环境变量配置
```env
DEEPSEEK_API_KEY=your_api_key_here
AI_PROVIDER=deepseek_chat
HOST=localhost
PORT=3004
```

### config.json - 聊天室和角色预设
包含 4 个预设聊天室：
- AI 茶话会（默认）
- 哲学沙龙
- 科幻世界
- 创意工坊

每个聊天室都有 3-4 个精心设计的 AI 角色。

## 兼容性
- Python: 3.10+（推荐 3.12 或 3.13）
- Node.js: 18+
- 现代浏览器（Chrome、Firefox、Safari、Edge）

## 获取帮助
- 查看 CHANGELOG.md 了解详细更新内容
- 查看 README.md 了解完整使用说明
- 前端文档: frontend/README.md

---
**上一版本**: v1.0.0 (2025-07-21)
