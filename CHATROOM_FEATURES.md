# AI Tea Party - 聊天室功能完整指南

## 🎉 新功能概览

AI Tea Party 现在支持完整的聊天室功能，包括：

- ✅ **多聊天室支持** - 创建和管理多个独立的聊天室
- ✅ **隐身模式** - 用户可以选择对AI不可见，AI只与AI对话
- ✅ **用户描述** - 非隐身模式下，AI会根据用户的自我描述进行互动
- ✅ **一对一聊天** - 支持用户与单个AI角色的私人对话
- ✅ **聊天室设置管理** - 动态调整聊天室配置
- ✅ **AI智能回复** - 支持Gemini 2.5 Flash、DeepSeek v3/r1等多种AI模型

## 🚀 快速开始

### 1. 启动应用
```bash
python main.py
```

### 2. 访问应用
打开浏览器访问：http://localhost:8000

## 📋 API 接口

### 聊天室管理

#### 创建聊天室
```http
POST /api/rooms
Content-Type: application/json

{
    "name": "我的聊天室",
    "description": "聊天室描述",
    "stealth_mode": false,
    "user_description": "我是一个喜欢AI技术的用户"
}
```

#### 获取所有聊天室
```http
GET /api/rooms
```

#### 更新聊天室设置
```http
PUT /api/rooms/{room_id}
Content-Type: application/json

{
    "stealth_mode": true,
    "user_description": "更新的用户描述",
    "name": "新的聊天室名称",
    "description": "新的描述"
}
```

### 角色管理

#### 添加角色到聊天室
```http
POST /api/rooms/{room_id}/characters
Content-Type: application/json

{
    "name": "Alice",
    "personality": "活泼开朗",
    "background": "学生",
    "speaking_style": "年轻活泼"
}
```

## 🎭 功能详解

### 1. 隐身模式 (Stealth Mode)

**开启隐身模式时：**
- 用户消息对AI不可见
- AI只能看到其他AI角色的消息
- AI之间进行纯粹的对话交流
- 用户可以观察AI角色的自然互动

**关闭隐身模式时：**
- AI可以感知用户的存在
- AI会根据用户的自我描述调整对话风格
- 用户可以参与到AI对话中

### 2. 用户描述功能

在非隐身模式下，用户可以设置自我描述，例如：
- "我是一个对AI技术很感兴趣的程序员"
- "我是一个喜欢哲学思辨的学生"
- "我是一个创意工作者，喜欢艺术和设计"

AI会根据这些描述调整对话内容和风格。

### 3. 一对一聊天

创建只有一个AI角色的聊天室，实现：
- 私密的用户-AI对话
- 个性化的AI助手体验
- 专注的问答和讨论

### 4. 多聊天室管理

- 每个聊天室独立运行
- 不同的AI角色组合
- 不同的主题和设置
- 灵活的聊天室切换

## 🔧 技术实现

### 核心组件

1. **ChatRoom 模型** (`models/character.py`)
   - 支持隐身模式和用户描述
   - 消息历史管理
   - 角色管理

2. **ChatService** (`services/chat_service.py`)
   - 聊天室创建和管理
   - 消息过滤（隐身模式）
   - 设置更新

3. **AI Service** (`services/ai_service.py`)
   - 多API提供商支持
   - 上下文感知回复
   - AI判别器功能

### 消息过滤逻辑

```python
def _prepare_messages_for_ai(self, room: ChatRoom, character: Character):
    """根据聊天室设置准备AI使用的消息历史"""
    if room.stealth_mode:
        # 隐身模式：只保留AI角色消息
        return [msg for msg in room.messages 
                if msg.is_system or msg.character_id in ai_character_ids]
    else:
        # 非隐身模式：包含用户描述信息
        if room.user_description:
            user_info = Message(content=f"用户信息：{room.user_description}")
            return [user_info] + room.messages
        return room.messages
```

## 🧪 测试验证

运行完整的功能测试：
```bash
python test_chatroom.py
```

测试包括：
- ✅ 聊天室创建和管理
- ✅ 角色添加和管理
- ✅ 隐身模式功能
- ✅ 聊天室设置更新
- ✅ 一对一聊天功能

## 📱 使用场景

### 场景1：AI角色观察
创建隐身模式聊天室，观察AI角色之间的自然对话：
```json
{
    "name": "AI哲学讨论",
    "stealth_mode": true,
    "description": "观察AI角色讨论哲学问题"
}
```

### 场景2：个性化AI助手
创建一对一聊天室，获得个性化AI服务：
```json
{
    "name": "我的AI助手",
    "stealth_mode": false,
    "user_description": "我是一个需要编程帮助的开发者"
}
```

### 场景3：主题讨论
创建特定主题的聊天室，邀请不同性格的AI参与：
```json
{
    "name": "科技创新讨论",
    "stealth_mode": false,
    "user_description": "我是一个关注科技趋势的投资者"
}
```

## 🔮 未来扩展

计划中的功能：
- 聊天室模板系统
- AI角色预设库
- 对话导出功能
- 聊天室分享机制
- 高级AI行为配置

## 🎯 总结

AI Tea Party 现在提供了完整的聊天室体验：

1. **灵活的交互模式** - 隐身观察或主动参与
2. **个性化体验** - 基于用户描述的AI适应
3. **多样化场景** - 从群聊到一对一的全覆盖
4. **强大的AI支持** - 多模型、智能回复、上下文感知

无论是想观察AI之间的有趣对话，还是需要个性化的AI助手，AI Tea Party 都能满足您的需求！

---

**开始体验：** 访问 http://localhost:8000 开始您的AI聊天室之旅！
