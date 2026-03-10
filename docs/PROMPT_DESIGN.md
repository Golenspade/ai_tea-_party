# Prompt 组装管线设计文档

> AI 茶话会 — System Prompt Architecture

## 设计原则

| 原则                 | 来源        | 实现                                           |
| -------------------- | ----------- | ---------------------------------------------- |
| 身份与行为分离       | SillyTavern | Main Prompt = 行为规范；CharacterCard = 身份   |
| PHI 放最后           | SillyTavern | 回复长度约束作为 POST_INSTRUCTIONS，紧贴生成位 |
| 不在 system 里堆规则 | Claude Soul | 让角色描述自然引导风格，而非用规则列表         |
| 长度由用户控制       | 自定义      | 前端三档选择器 → PHI 注入                      |

## Prompt 组装结构

```
┌─────────────────────────────────────────┐
│ [system] WI_SYSTEM_TOP                  │  全局世界观
├─────────────────────────────────────────┤
│ [system] 合并消息                       │
│   ① Main Prompt (行为指令)              │  角色 override / 默认
│   ② WI_BEFORE_CHAR                      │  触发的世界观条目
│   ③ 角色身份 (名字+描述+背景)           │  CharacterCard
│   ④ 性格特质                            │
│   ⑤ 场景设定                            │
│   ⑥ WI_AFTER_CHAR                       │
│   ⑦ 说话风格                            │
│   ⑧ 用户人设 (Persona)                  │
├─────────────────────────────────────────┤
│ [few-shot] 示例对话                     │  ExampleDialogues
├─────────────────────────────────────────┤
│ [system] 角色记忆                       │  CharacterMemory
├─────────────────────────────────────────┤
│ [user/assistant] 聊天历史 (×25)         │  最近 25 条
│   (穿插 WI_AT_DEPTH)                    │
├─────────────────────────────────────────┤
│ [system] PHI (角色级)                   │  character.post_instructions
│ [system] PHI (长度约束)                 │  LENGTH_GUIDANCE[选择]
│ [system] 对话情境分析                   │  Orchestrator 追加
│ [system] WI_SYSTEM_BOTTOM               │
└─────────────────────────────────────────┘
```

## 槽位定义

参见 `core/prompt/slots.py`：

| 槽位                | 说明             | 注入位置          |
| ------------------- | ---------------- | ----------------- |
| `MAIN_PROMPT`       | 行为指令模板     | system 合并消息   |
| `WI_BEFORE_CHAR`    | 世界观（角色前） | system 合并消息   |
| `CHAR_DESCRIPTION`  | 角色身份描述     | system 合并消息   |
| `CHAR_PERSONALITY`  | 性格特质         | system 合并消息   |
| `SCENARIO`          | 场景设定         | system 合并消息   |
| `WI_AFTER_CHAR`     | 世界观（角色后） | system 合并消息   |
| `PERSONA`           | 用户人设         | system 合并消息   |
| `EXAMPLE_DIALOGUES` | few-shot 示例    | user/assistant 对 |
| `CHAT_HISTORY`      | 聊天历史         | user/assistant    |
| `WI_DEPTH`          | 深度世界观       | 穿插在历史中      |
| `POST_INSTRUCTIONS` | 最终约束 (PHI)   | 最后的 system     |

## 回复长度控制

三档设置，通过 `POST /api/settings` 切换：

| 选项      | PHI 注入文本                             |
| --------- | ---------------------------------------- |
| `short`   | 简洁回复，1-2句话，像微信聊天一样精炼    |
| `default` | 自然回复，2-5句话，可以适当展开          |
| `long`    | 充分展开，包含细节、故事、例子，篇幅不限 |

**为什么放在 PHI？** 模型对最近的 system 消息赋予最高注意力权重（recency bias），PHI 紧贴生成位，是控制输出风格最有效的位置。

## 关键文件

| 文件                                | 职责                               |
| ----------------------------------- | ---------------------------------- |
| `core/prompt/assembler.py`          | Prompt 编排器，按槽位组装 messages |
| `core/prompt/slots.py`              | 槽位枚举定义                       |
| `core/prompt/world_info_scanner.py` | WorldInfo 关键词触发扫描           |
| `services/orchestrator.py`          | 调用 Assembler + 追加记忆/情境     |
| `models/character.py`               | CharacterCard 数据模型             |
