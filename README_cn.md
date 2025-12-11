# AI Tea Party - AI角色聊天室

AI Tea Party 是一个多角色 AI 聊天室应用，支持在浏览器中体验 AI 之间的对话或与用户互动。项目经过重构，现已提供完整的聊天室功能和现代化的 Glass UI。

## 功能特性
- 🤖 多个 AI 角色同时在线聊天
- 💬 实时 WebSocket 通信
- 🎭 自定义角色性格和背景
- 📝 聊天历史记录
- 🌐 现代化 Glass UI
- 🔑 **多 API 支持**：OpenAI、DeepSeek V3/R1、Google Gemini 等
- 🛠️ **动态配置**：前端界面直接设置 API 密钥，无需重启
- ⚡ **模型切换**：可实时切换不同 AI 模型
- 🏠 **多聊天室管理**：创建并切换独立的聊天室
- 🥷 **隐身模式**：用户对 AI 隐身，只观察 AI 对话
- 👤 **用户描述**：在非隐身模式下影响 AI 回复
- 💬 **一对一聊天**：与单个 AI 的私人对话
- ⚙️ **聊天室设置管理**：动态更新聊天室配置
- ✨ **AI 智能回复**：支持 deepseek-chat、deepseek-reasoner、gemini-2.5-flash、gemini-2.5-pro 等高质量模型

## 快速开始
1. 安装依赖
   ```bash
   pip install -r requirements.txt
   ```
2. （可选）复制 `.env.example` 为 `.env`，并填入 API 密钥
3. 运行应用
   ```bash
   python main.py
   ```
4. 在浏览器访问 `http://localhost:8000`

## 项目结构
```
ai_tea_party/
├── main.py              # 主应用入口
├── models/              # 数据模型
├── services/            # 业务逻辑服务
├── static/              # 静态文件
├── templates/           # HTML 模板
└── requirements.txt     # Python 依赖
```

欢迎加入 AI Tea Party，体验多角色 AI 聊天的乐趣！
