# AI Tea Party - Claude Code 工作区配置

## 项目概述

AI Tea Party 是一个多角色AI对话系统，允许创建多个AI角色并在聊天室中进行对话。系统支持多种AI API（DeepSeek 和 Google Gemini），具有现代化的Web界面和实时通信功能。

## 技术栈

### 后端
- **Python**: 3.12+（代码兼容3.10-3.14）
- **FastAPI**: Web框架 + WebSocket支持
- **AI API**: OpenAI SDK (DeepSeek), Google Generative AI (Gemini)
- **包管理**: uv (Astral)

### 前端
- **框架**: Next.js 15 + React 19
- **语言**: TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **图标**: Lucide Icons

## 开发环境设置

### 快速启动

```bash
# 1. 安装后端依赖
uv sync

# 2. 启动后端服务
uv run python main.py

# 3. 在新终端中启动前端
cd frontend
npm run dev
```

### 服务地址
- 后端 API: http://localhost:3004
- 前端界面: http://localhost:3001

### 配置文件

#### .env 环境变量
```env
# AI API 配置
DEEPSEEK_API_KEY=your_deepseek_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
AI_PROVIDER=deepseek_chat  # 或: deepseek_reasoner, gemini_25_flash, gemini_25_pro

# 服务器配置
HOST=localhost
PORT=3004

# 应用配置
MAX_HISTORY_LENGTH=50
AUTO_CHAT_INTERVAL=5
```

#### config.json
定义聊天室和角色预设，支持热重载。

## 常见开发任务

### 使用命令

为常见任务创建了前缀命令：

- `/start-backend` - 启动后端服务
- `/start-frontend` - 启动前端开发服务器
- `/install-deps` - 安装后端依赖
- `/run-tests` - 运行测试

### API 测试

可以使用 `debug_openai_client.py` 测试 AI API 连接：

```bash
python debug_openai_client.py
```

### 项目结构

```
ai_tea_party/
├── main.py                      # 应用入口
├── config.json                  # 聊天室/角色配置
├── .env                        # 环境变量
│
├── services/                    # 业务逻辑
│   ├── ai_service.py           # AI API服务
│   └── chat_service.py         # 聊天室服务
│
├── models/                     # 数据模型
│   └── character.py            # 角色和消息模型
│
├── utils/                      # 工具模块
│   ├── config_loader.py        # 配置加载器
│   └── env_watcher.py          # .env热重载
│
└── frontend/                   # Next.js前端
    ├── app/                    # App Router
    ├── components/             # 组件
    │   └── ui/                # shadcn/ui组件
    └── lib/                   # 工具函数
```

## Claude Code 特殊配置

### 忽略规则
项目已配置 `.gitignore` 忽略：
- `__pycache__/` - Python缓存文件
- `*.pyc` - 编译的Python文件
- `.venv/` - 虚拟环境
- `frontend/node_modules/` - Node依赖

### Python 环境
使用 `uv` 管理依赖，虚拟环境位于 `.venv/`。Claude Code可以使用以下命令：

```bash
# Python
uv run python main.py

# 安装新包
uv add package_name
uv add --dev package_name

# 更新依赖
uv sync
```

## 调试技巧

### 后端日志
查看 stdout/stderr 获取详细日志信息，包括：
- API 请求和响应
- WebSocket 连接状态
- AI API 调用详情

### 前端调试
在浏览器开发者工具中查看：
- Console - JavaScript错误和日志
- Network - API请求状态
- WebSocket - 实时通信状态

### 常见问题

1. **API连接失败**
   - 检查API密钥是否正确
   - 验证网络连接
   - 查看后端控制台日志

2. **前端构建错误**
   - 检查Node.js版本（需要18+）
   - 删除node_modules重新安装

3. **WebSocket连接失败**
   - 检查后端是否运行
   - 确认前端API地址配置正确

## 设计原则

1. **热重载优先**: 修改.env或config.json无需重启
2. **类型安全**: 前后端都使用类型系统
3. **响应式UI**: 支持各种屏幕尺寸
4. **错误边界**: 优雅处理API失败情况
5. **实时通信**: WebSocket保持同步

## 版本信息

当前版本: v2.0.0
发布日期: 2025-10-03
代号: "Modern UI & Smart Config"
