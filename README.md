# AI Tea Party - AI角色聊天室

一个让不同AI角色相互对话的聊天室应用。

## 功能特性

- 🤖 多个AI角色同时在线聊天
- 💬 实时WebSocket通信
- 🎭 可自定义角色性格和背景
- 📝 聊天历史记录
- 🌐 简洁的Web界面
- 🔑 **多API支持**: 支持OpenAI、DeepSeek V3/R1、Google Gemini等多个AI API
- 🛠️ **动态配置**: 前端界面直接配置API密钥，无需重启应用
- ⚡ **智能切换**: 支持不同AI模型的实时切换

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量（可选）

复制 `.env.example` 为 `.env` 并填入你的API密钥：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置默认的AI API提供商和密钥。

**注意**: 现在支持在Web界面中直接配置API，无需预先设置环境变量。

### 3. 运行应用

```bash
python main.py
```

然后在浏览器中访问 `http://localhost:8000`

## 项目结构

```
ai_tea_party/
├── main.py              # 主应用入口
├── models/              # 数据模型
├── services/            # 业务逻辑服务
├── static/              # 静态文件
├── templates/           # HTML模板
├── requirements.txt     # Python依赖
└── .env                 # 环境配置
```

## 使用说明

### 方法一：使用启动脚本（推荐）

```bash
python start.py
```

启动脚本会自动：
- 检查Python版本和依赖
- 创建环境配置文件
- 安装必要的包
- 启动应用服务器

### 方法二：手动启动

1. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   ```
   编辑 `.env` 文件，设置AI服务提供商和API密钥：

   **使用DeepSeek API（推荐，成本更低）：**
   ```
   AI_PROVIDER=deepseek
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   ```

   **使用OpenAI API：**
   ```
   AI_PROVIDER=openai
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **启动应用**
   ```bash
   python main.py
   ```

4. **访问应用**
   在浏览器中打开 `http://localhost:8000`

### 添加预设角色

```bash
# 添加示例角色到聊天室
python preset_characters.py

# 查看预设角色信息
python preset_characters.py info
```

### 运行演示

```bash
# 运行自动演示（需要先启动服务器）
python demo.py
```

## 功能说明

1. **角色管理**
   - 点击"+"按钮添加新的AI角色
   - 设置角色的名称、性格、背景和说话风格
   - 可以删除不需要的角色

2. **聊天功能**
   - 选择角色手动发送消息
   - 点击角色旁的"发言"按钮让AI生成回复
   - 开启自动聊天让AI角色们自动对话

3. **实时通信**
   - 使用WebSocket实现实时消息推送
   - 多个浏览器窗口可以同时观看聊天

4. **聊天控制**
   - 开始/停止自动聊天
   - 清空聊天记录
   - 查看连接状态
