# AI Tea Party 新版前端快速开始

## 简介

这是 AI Tea Party 的现代化前端，使用 Next.js 和 shadcn/ui 组件库构建。

## 前提条件

- Node.js 18 或更高版本
- npm 或 yarn
- 后端服务运行在 `http://localhost:8000`

## 安装步骤

1. **进入前端目录**
   ```bash
   cd frontend
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **打开浏览器**
   访问 [http://localhost:3000](http://localhost:3000)

## 基本使用

### 1. 配置 API
首次使用需要配置 AI API：

1. 点击右上角的齿轮图标 ⚙️
2. 选择 API 提供商（DeepSeek 或 Gemini）
3. 输入您的 API 密钥
4. 点击"保存配置"

### 2. 添加角色
1. 在左侧边栏点击"Add Character"按钮
2. 填写角色信息：
   - 名称：角色的名字
   - 性格：角色的性格特点
   - 背景：角色的背景故事
   - 说话风格：（可选）角色的说话方式
3. 点击"Save"保存

### 3. 开始聊天
有两种方式让角色说话：

**手动发送消息**：
1. 在底部选择一个角色
2. 输入消息内容
3. 按回车或点击发送按钮

**触发 AI 回复**：
1. 将鼠标悬停在角色卡片上
2. 点击消息图标让该角色说话

**自动聊天**：
1. 点击左侧的"Start Auto Chat"按钮
2. 角色们将自动开始对话
3. 点击"Stop Auto Chat"停止

## 功能说明

### 角色管理
- ➕ 添加新角色
- 🗑️ 删除角色（悬停显示）
- 💬 触发角色发言（悬停显示）
- 🎨 自动分配彩色头像

### 聊天功能
- 💬 实时消息显示
- ⏰ 消息时间戳
- 📜 自动滚动到最新消息
- 🧹 清空聊天记录

### 聊天控制
- ▶️ 开始自动聊天
- ⏹️ 停止自动聊天
- 🗑️ 清空消息

### 状态指示
- 🟢 绿色徽章 = 已连接
- 🔴 红色徽章 = 未连接
- 🔵 蓝色徽章 = 自动聊天激活

## 快捷键

- `Enter` - 在输入框中按回车发送消息
- `Esc` - 关闭对话框

## 常见问题

### Q: 显示"未连接"怎么办？
A: 确保后端服务正在运行：
```bash
# 在项目根目录运行
python main.py
```

### Q: 无法添加角色？
A: 请先配置 API 密钥：
1. 点击右上角齿轮图标
2. 选择提供商并输入 API 密钥

### Q: 消息没有实时更新？
A: 检查 WebSocket 连接状态（右上角徽章）。如果显示"未连接"，刷新页面重新连接。

### Q: 如何切换深色模式？
A: 当前根据系统主题自动切换。可以在系统设置中更改主题。

## 开发命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint
```

## 支持的 API 提供商

1. **DeepSeek Chat** (`deepseek_chat`)
   - 高性价比
   - 中文支持优秀

2. **DeepSeek Reasoner** (`deepseek_reasoner`)
   - 推理能力强
   - 适合复杂对话

3. **Gemini 2.5 Flash** (`gemini_25_flash`)
   - 响应速度快
   - 成本较低

4. **Gemini 2.5 Pro** (`gemini_25_pro`)
   - 能力最强
   - 适合复杂任务

## 获取 API 密钥

### DeepSeek
1. 访问 [https://platform.deepseek.com](https://platform.deepseek.com)
2. 注册账号
3. 在 API Keys 页面创建新密钥

### Google Gemini
1. 访问 [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. 使用 Google 账号登录
3. 创建 API 密钥

## 技术支持

如遇问题，请查看：
- [详细文档](./README.md)
- [迁移指南](../FRONTEND_MIGRATION.md)
- 项目 Issues

## 版本信息

- 版本：1.0.0
- Next.js：15.5.4
- React：19.1.0
- shadcn/ui：最新版本

---

享受与 AI 角色的对话吧！🎉
